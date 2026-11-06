/**
 * Netlify Function - Génère une synthèse structurée d'une réponse Doctrine.
 *
 * Flux : l'opérateur colle la réponse brute obtenue depuis Doctrine.fr →
 * OpenAI génère une synthèse Markdown structurée → mise à jour de la ligne
 * consultations_juridiques avec synthese, reponse_doctrine et statut='terminee'.
 *
 * Env vars : OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

async function requireAdmin(token) {
  if (!token) return false;
  const userRes = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  if (!user?.id) return false;
  const adminRes = await fetch(
    `${SB}/rest/v1/admins?user_id=eq.${user.id}&select=id`,
    { headers: srvHeaders() },
  );
  if (!adminRes.ok) return false;
  const rows = await adminRes.json();
  return Array.isArray(rows) && rows.length > 0;
}

const MAX_REPONSE_LENGTH = 15000;

const SYSTEM_PROMPT = `Tu es un assistant juridique pour un syndicat de médecins libéraux. Un médecin a posé une question juridique et voici la réponse détaillée trouvée dans la base de données juridique Doctrine.fr. Génère une synthèse structurée en Markdown avec : ## Résumé (3-5 lignes max) | ## Points clés (liste à puces, max 6 points) | ## Recommandations pratiques (liste à puces, 3-5 actions concrètes pour un médecin libéral) | ## ⚠️ Avertissement (1 ligne rappelant que ceci n'est pas un avis juridique et qu'un avocat doit être consulté pour les situations complexes). Sois concis, pratique, sans jargon excessif.`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!(await requireAdmin(token))) {
    return { statusCode: 403, headers, body: '{"error":"Accès réservé aux administrateurs"}' };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY non configurée' }) };
  }
  if (!SSK) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurée' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' };
  }

  const { consultationId, reponseDoctrine } = body;

  if (!consultationId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'consultationId requis' }) };
  }
  if (!reponseDoctrine || typeof reponseDoctrine !== 'string' || reponseDoctrine.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Champ reponseDoctrine manquant ou vide' }) };
  }
  if (reponseDoctrine.length > MAX_REPONSE_LENGTH) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Réponse trop longue (max ${MAX_REPONSE_LENGTH} caractères)` }) };
  }

  // Appel OpenAI pour la synthèse
  let synthese;
  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: reponseDoctrine.trim() },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur OpenAI', detail: errText.slice(0, 200) }) };
    }

    const aiData = await aiRes.json();
    synthese = aiData.choices?.[0]?.message?.content?.trim();
    if (!synthese) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Réponse OpenAI vide' }) };
    }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur lors de la synthèse', detail: e.message }) };
  }

  // Mise à jour de la ligne dans Supabase (service role, bypass RLS)
  const upd = await fetch(
    `${SB}/rest/v1/consultations_juridiques?id=eq.${encodeURIComponent(consultationId)}`,
    {
      method: 'PATCH',
      headers: srvHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ synthese, reponse_doctrine: reponseDoctrine.trim(), statut: 'terminee' }),
    }
  );

  if (!upd.ok) {
    const t = await upd.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur mise à jour Supabase', detail: t.slice(0, 200) }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ synthese }),
  };
};
