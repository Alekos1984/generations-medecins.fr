/**
 * Netlify Function — Déclenche le workflow GitHub Actions "Import Observatoire".
 *
 * Le bouton "🚀 Lancer un import" de l'admin appelle cette fonction. Elle :
 *   1. vérifie que l'appelant est un admin (JWT Supabase)
 *   2. POST /actions/workflows/<file>/dispatches sur l'API GitHub avec un PAT
 *      stocké côté serveur (env var, jamais exposé au navigateur)
 *
 * Évite le souci CORS qu'on aurait en tapant api.github.com directement
 * depuis le navigateur, et garde le PAT en sécurité.
 *
 * Env vars :
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (auth)
 *   GH_DISPATCH_TOKEN     (Personal Access Token, scope Actions: R/W)
 *   GH_DISPATCH_OWNER     (ex: "edouardklein")
 *   GH_DISPATCH_REPO      (ex: "generations-medecins.fr")
 *   GH_DISPATCH_WORKFLOW  (ex: "observatoire-import.yml")
 *   GH_DISPATCH_REF       (ex: "claude/mockup-vitrine")
 */

async function verifyAdmin(token) {
  if (!token) return null;
  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const adminRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admins?select=role&user_id=eq.${user.id}`,
    { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const admins = await adminRes.json();
  return admins?.[0] ? user : null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const user = await verifyAdmin(token);
  if (!user) return { statusCode: 403, headers, body: '{"error":"Accès réservé aux admins"}' };

  const PAT      = process.env.GH_DISPATCH_TOKEN;
  const owner    = process.env.GH_DISPATCH_OWNER    || 'edouardklein';
  const repo     = process.env.GH_DISPATCH_REPO     || 'generations-medecins.fr';
  const workflow = process.env.GH_DISPATCH_WORKFLOW || 'observatoire-import.yml';
  const ref      = process.env.GH_DISPATCH_REF      || 'claude/mockup-vitrine';

  if (!PAT) {
    return { statusCode: 500, headers, body: JSON.stringify({
      error: 'GH_DISPATCH_TOKEN non configuré côté serveur. Définis-le dans les variables d\'environnement Netlify.',
    })};
  }

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const ghRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAT}`,
      Accept:        'application/vnd.github+json',
      'Content-Type':'application/json',
      'User-Agent':  'generations-medecins-admin',
    },
    body: JSON.stringify({ ref }),
  });

  if (ghRes.status === 204) {
    return { statusCode: 200, headers, body: JSON.stringify({
      ok: true,
      run_url: `https://github.com/${owner}/${repo}/actions/workflows/${workflow}`,
    })};
  }

  const errText = await ghRes.text();
  return { statusCode: 502, headers, body: JSON.stringify({
    error: `GitHub a répondu ${ghRes.status}`,
    detail: errText.slice(0, 400),
  })};
};
