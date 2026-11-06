/**
 * Netlify Function - Diagnostic veille (sync, < 10s)
 *
 * Teste les flux RSS un par un et renvoie immédiatement les résultats bruts.
 * Utile pour diagnostiquer les blocages réseau depuis les IPs Netlify.
 * Accès : super-admin uniquement.
 */

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search?q={q}&hl=fr&gl=FR&ceid=FR:fr';

const FEEDS_TO_CHECK = [
  { nom: 'Egora (GN site)',     url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('site:egora.fr')) },
  { nom: "What's up Doc (GN)", url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('site:whatsupdoc-lemag.fr')) },
  { nom: 'Quotidien (GN site)', url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('site:lequotidiendumedecin.fr')) },
  { nom: 'JIM (GN site)',       url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('site:jim.fr')) },
  { nom: 'Medscape (GN site)',  url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('site:francais.medscape.com')) },
  { nom: 'GN convention',       url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent('convention médicale médecins CNAM')) },
];

function parseItemCount(xml) {
  const matches = xml.match(/<item[^>]*>/gi);
  return matches ? matches.length : 0;
}

function parseFirstTitles(xml, n = 3) {
  const titles = [];
  const re = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/gi;
  let m;
  while ((m = re.exec(xml)) !== null && titles.length < n + 1) {
    const t = m[1].trim();
    if (t && !t.includes('<') && !titles.includes(t)) titles.push(t);
  }
  return titles.filter((_, i) => i > 0).slice(0, n); // skip channel title
}

async function verifySuperAdmin(token) {
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
  return admins?.[0]?.role === 'super_admin' ? user : null;
}

exports.handler = async (event) => {
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const user  = await verifySuperAdmin(token);
  if (!user) return { statusCode: 403, body: 'Unauthorized' };

  const checks = await Promise.all(
    FEEDS_TO_CHECK.map(async (feed) => {
      const start = Date.now();
      try {
        const r = await fetch(feed.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GenerationsMedecins-Veille/2.0; +https://generations-medecins.fr)',
            'Accept':     'application/rss+xml, application/xml, text/xml, */*',
          },
          signal: AbortSignal.timeout(8000),
        });
        const elapsed = Date.now() - start;
        if (!r.ok) {
          return { nom: feed.nom, status: r.status, ok: false, items: 0, titles: [], ms: elapsed };
        }
        const xml = await r.text();
        const items = parseItemCount(xml);
        const titles = parseFirstTitles(xml, 3);
        return { nom: feed.nom, status: r.status, ok: true, items, titles, ms: elapsed };
      } catch (e) {
        return { nom: feed.nom, status: 'ERROR', ok: false, items: 0, titles: [], error: e.message, ms: Date.now() - start };
      }
    })
  );

  const envCheck = {
    OPENAI_API_KEY:            !!process.env.OPENAI_API_KEY,
    BREVO_API_KEY:             !!process.env.BREVO_API_KEY,
    ADMIN_EMAIL:               process.env.ADMIN_EMAIL || '(non défini)',
    SUPABASE_URL:              !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feeds: checks, env: envCheck }, null, 2),
  };
};
