/**
 * Netlify Function - Anonymise et reformule une question juridique pour Doctrine.fr
 *
 * Flux : le membre soumet sa question → anonymisation des données personnelles →
 * reformulation en requête juridique structurée → mise à jour de la ligne
 * consultations_juridiques avec question_reformulee et statut='prete'.
 *
 * Env vars : OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

async function getMembre(token) {
  if (!token) return null;
  const userRes = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const mRes = await fetch(
    `${SB}/rest/v1/membres?user_id=eq.${user.id}&statut=eq.actif&select=id`,
    { headers: srvHeaders() },
  );
  if (!mRes.ok) return null;
  const rows = await mRes.json();
  return rows?.[0] || null;
}

const MAX_QUESTION_LENGTH = 5000;

const SYSTEM_PROMPT = `Tu es un assistant juridique pour un syndicat de médecins libéraux. Ton rôle est de transformer une question posée par un médecin en une requête juridique précise pour le moteur de recherche Doctrine.fr.
ÉTAPE 1 - ANONYMISATION : Remplace tout nom propre de personne par [MÉDECIN] ou [PATIENT] selon le contexte. Remplace toute adresse par [ADRESSE]. Remplace tout numéro RPPS, SIRET, téléphone ou email par [IDENTIFIANT].
ÉTAPE 2 - REFORMULATION : Transforme la question en une requête juridique structurée : contexte médical/légal, question principale, sous-questions si pertinent. Utilise le vocabulaire juridique approprié au droit médical français.
Réponds UNIQUEMENT avec la requête reformulée, sans préambule ni explication.`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const membre = await getMembre(token);
  if (!membre) {
    return { statusCode: 403, headers, body: '{"error":"Authentification requise"}' };
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

  const { question, consultationId } = body;
  const membreId = membre.id;

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Champ question manquant ou vide' }) };
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Question trop longue (max ${MAX_QUESTION_LENGTH} caractères)` }) };
  }
  if (!consultationId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'consultationId requis' }) };
  }

  // Appel OpenAI - on ne logue jamais le contenu de la question originale
  let question_reformulee;
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
          { role: 'user',   content: question.trim() },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur OpenAI', detail: errText.slice(0, 200) }) };
    }

    const aiData = await aiRes.json();
    question_reformulee = aiData.choices?.[0]?.message?.content?.trim();
    if (!question_reformulee) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Réponse OpenAI vide' }) };
    }
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur lors de la reformulation', detail: e.message }) };
  }

  // Mise à jour de la ligne dans Supabase (service role, bypass RLS)
  const upd = await fetch(
    `${SB}/rest/v1/consultations_juridiques?id=eq.${encodeURIComponent(consultationId)}&membre_id=eq.${encodeURIComponent(membreId)}`,
    {
      method: 'PATCH',
      headers: srvHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ question_reformulee, statut: 'prete' }),
    }
  );

  if (!upd.ok) {
    const t = await upd.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur mise à jour Supabase', detail: t.slice(0, 200) }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ question_reformulee }),
  };
};
