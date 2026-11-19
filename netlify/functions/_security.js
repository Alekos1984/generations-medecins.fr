// Utilitaires de sécurité partagés par les fonctions Netlify.
const crypto = require('crypto');

// Secret dédié aux déclenchements planifiés. CRON_SECRET est à définir dans Netlify ;
// tant qu'il est absent, repli sur l'ancienne clé pour ne rien casser.
function cronSecret() {
  return process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function isCron(headers = {}) {
  const key = headers['x-cron-key'] || headers['X-Cron-Key'];
  return safeEqual(key, cronSecret());
}

function bearer(headers = {}) {
  return String(headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// Limitation de débit : compteur par fenêtre dans Supabase (fonction check_rate_limit, service_role).
// Clé = nom + empreinte salée de l'IP (l'IP elle-même n'est jamais stockée). Échec ouvert si la base ne répond pas.
async function rateLimit(event, name, max, windowSeconds, extraKey = '') {
  try {
    const h = event.headers || {};
    const ip = h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
    const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const id = crypto.createHmac('sha256', salt).update(ip + '|' + extraKey).digest('hex').slice(0, 32);
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: `${name}:${id}`, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!r.ok) return true;
    return (await r.json()) !== false;
  } catch { return true; }
}

const TOO_MANY = { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '600' }, body: '{"error":"Trop de requêtes, réessayez plus tard."}' };

module.exports = { cronSecret, safeEqual, isCron, bearer, rateLimit, TOO_MANY };
