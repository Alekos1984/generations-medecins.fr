// Reformulation de texte via OpenAI GPT-4o-mini
// POST { text: string, fieldKey: string }  - requires valid Supabase JWT
// Returns { reformule: string }

const SB   = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

async function isAuthenticated(token) {
  if (!token || !SB || !ANON) return false;
  const res = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!res.ok) return false;
  const user = await res.json();
  return !!user?.id;
}

const PROMPTS = {
  motifs:
    "Tu es médecin généraliste et juriste en droit de la santé. Reformule ces motifs de contestation de manière structurée, professionnelle et convaincante pour un courrier officiel à la CPAM. Garde la même longueur approximative. Réponds uniquement avec le texte reformulé, sans préambule.",
  motif_reversement:
    "Tu es médecin. Résume en termes précis et neutres ce motif de reversement CPAM tel qu'il sera cité dans un courrier de contestation. Réponds uniquement avec le texte reformulé.",
  motif:
    "Tu es médecin rédigeant un courrier officiel à un patient. Reformule ce motif de manière factuelle, neutre et professionnelle, en restant concis. Réponds uniquement avec le texte reformulé.",
  motifs_urssaf:
    "Tu es expert-comptable spécialisé en professions libérales. Reformule ces motifs de contestation d'un redressement URSSAF de manière structurée, argumentée et conforme au droit social. Réponds uniquement avec le texte reformulé.",
  conditions_proposees:
    "Tu es juriste en droit médical. Reformule ces conditions de collaboration libérale en termes formels et précis, conformes à la réglementation des médecins libéraux. Réponds uniquement avec le texte reformulé.",
  description_travaux:
    "Tu es juriste en droit immobilier. Reformule cette description de travaux en termes techniques formels adaptés à un courrier de mise en demeure au bailleur, en précisant les obligations locatives. Réponds uniquement avec le texte reformulé.",
  motif_resiliation:
    "Tu es juriste en droit immobilier. Reformule ce motif de résiliation de bail professionnel en termes formels et clairs pour un courrier officiel. Réponds uniquement avec le texte reformulé.",
  motif_resiliation_doctolib:
    "Tu es juriste contractuel. Reformule ce motif de résiliation d'un contrat Doctolib en termes formels et clairs pour un courrier officiel. Réponds uniquement avec le texte reformulé.",
  objet_demande:
    "Tu es juriste spécialisé en droit numérique et RGPD. Reformule ce texte en termes formels et précis pour une demande officielle de droit à l'effacement conforme au RGPD. Réponds uniquement avec le texte reformulé.",
  nature_diffamation:
    "Tu es avocat spécialisé en droit de la presse. Reformule la description de ces propos diffamatoires de manière juridique précise, en qualifiant les faits et en citant les éléments pertinents. Réponds uniquement avec le texte reformulé.",
  description_incident:
    "Tu es juriste. Reformule cette description d'incident en style factuel, neutre et chronologique, adapté à un signalement officiel ou un dépôt de plainte. Réponds uniquement avec le texte reformulé.",
};

const DEFAULT_PROMPT =
  "Tu es assistant juridique pour des médecins libéraux. Reformule ce texte de manière professionnelle, formelle et concise pour un courrier officiel. Réponds uniquement avec le texte reformulé, sans préambule.";

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!(await isAuthenticated(token))) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Authentification requise' }) };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY non configurée' }) };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { text, fieldKey } = body;
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Champ text manquant ou vide' }) };
  }
  if (text.length > 4000) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Texte trop long (max 4000 caractères)' }) };
  }

  const systemPrompt = PROMPTS[fieldKey] || DEFAULT_PROMPT;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        max_tokens: 600,
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: 'OpenAI error: ' + err }) };
    }

    const data = await response.json();
    const reformule = data.choices?.[0]?.message?.content?.trim();
    if (!reformule) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Réponse OpenAI vide' }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reformule }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
