/**
 * Netlify Function — Génère une analyse en langage naturel des KPIs de l'observatoire.
 *
 * Flux : admin clique "🤖 Générer l'analyse" dans l'admin observatoire →
 * lit les KPIs validés actuels + l'historique 12 mois → demande à OpenAI
 * une synthèse → stocke dans observatoire_analyses → affichée sur la page
 * publique /observatoire.
 *
 * Env vars : OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */

const SB   = process.env.SUPABASE_URL;
const SSK  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

async function requireAdmin(token) {
  if (!token) return null;
  const userRes = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const adminRes = await fetch(
    `${SB}/rest/v1/admins?user_id=eq.${user.id}&select=id`,
    { headers: srvHeaders() },
  );
  if (!adminRes.ok) return null;
  const rows = await adminRes.json();
  return (Array.isArray(rows) && rows.length > 0) ? user : null;
}

const SYSTEM_PROMPT = `Tu es un analyste pour un syndicat de médecins libéraux (Générations Médecins).
Tu reçois un ensemble d'indicateurs sur la démographie médicale en Île-de-France
(effectifs, tarifs, délais d'accès, zones sous-dotées), avec leur valeur actuelle
et leur historique sur les 12 derniers mois quand disponible.

Génère une analyse en Markdown structurée :

## Constat
Une phrase chiffrée par indicateur avec l'évolution (en %, en hausse/baisse).
Ne mentionne que les indicateurs réellement présents et avec une source crédible.

## Tendances clés
3 à 5 phrases qui dégagent les évolutions les plus marquantes — qu'est-ce qui
monte/baisse vraiment ? Y a-t-il des inquiétudes ?

## Points d'attention pour les médecins
2-3 phrases sur ce que ces chiffres impliquent concrètement pour la profession.

Règles :
- Ne JAMAIS inventer de chiffre. Si un indicateur est marqué "source à vérifier"
  ou si sa valeur est "— j" / "— %", ignore-le purement.
- Pas de jargon ni de langue de bois. Style direct, factuel.
- Maximum 250 mots au total.`;

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = await requireAdmin(token);
  if (!user) return { statusCode: 403, headers, body: '{"error":"Accès réservé aux administrateurs"}' };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'OPENAI_API_KEY non configurée' }) };
  if (!SSK)    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE_KEY non configurée' }) };

  // 1. Récupère KPIs validés + tendances + 12 mois d'historique
  const [kpisR, tendR, histR, seriesR] = await Promise.all([
    fetch(`${SB}/rest/v1/observatoire_kpis?statut=eq.validated&select=*`, { headers: srvHeaders() }),
    fetch(`${SB}/rest/v1/observatoire_kpis_tendance?select=*`,             { headers: srvHeaders() }),
    fetch(`${SB}/rest/v1/observatoire_kpis_history?select=*&order=snapshot_at.asc`, { headers: srvHeaders() }),
    fetch(`${SB}/rest/v1/observatoire_series?statut=eq.validated&select=*&order=serie_id.asc,rang.asc`, { headers: srvHeaders() }),
  ]);
  const kpis = await kpisR.json();
  const tend = await tendR.json();
  const hist = await histR.json();
  const series = await seriesR.json();

  const tendById = Object.fromEntries((tend||[]).map(t => [t.kpi_id, t]));
  const histById = {};
  (hist||[]).forEach(h => { (histById[h.kpi_id] = histById[h.kpi_id] || []).push({ d: h.snapshot_at?.slice(0,10), v: h.valeur_num }); });

  // 2. Construit le contexte à donner à l'IA
  const ctx = {
    date: new Date().toISOString().slice(0,10),
    kpis: (kpis||[]).map(k => ({
      id: k.id, label: k.label, valeur: k.valeur, source: k.source, annee: k.annee,
      tendance_auto_pct_12mois: tendById[k.id]?.pct_variation ?? null,
      historique: histById[k.id] || [],
    })),
    series: (series||[]).map(s => ({ serie_id: s.serie_id, label: s.label, valeur: s.valeur_fmt, source: s.source })),
  };

  // 3. Appel OpenAI
  let analyse;
  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: 'Données :\n```json\n' + JSON.stringify(ctx, null, 2) + '\n```' },
        ],
        max_tokens: 900,
        temperature: 0.4,
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur OpenAI', detail: errText.slice(0, 300) }) };
    }
    const aiData = await aiRes.json();
    analyse = aiData.choices?.[0]?.message?.content?.trim();
    if (!analyse) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Réponse OpenAI vide' }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erreur génération', detail: e.message }) };
  }

  // 4. Stocke dans observatoire_analyses
  const ins = await fetch(`${SB}/rest/v1/observatoire_analyses`, {
    method: 'POST',
    headers: srvHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      contenu:       analyse,
      modele:        'gpt-4o-mini',
      kpis_snapshot: ctx,
      created_by:    user.id,
    }),
  });
  if (!ins.ok) {
    const t = await ins.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur insertion', detail: t.slice(0, 200) }) };
  }
  const row = (await ins.json())[0];

  return { statusCode: 200, headers, body: JSON.stringify({ analyse, id: row.id, date_periode: row.date_periode }) };
};
