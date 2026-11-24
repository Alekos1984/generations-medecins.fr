// Utilitaires de sécurité partagés par les fonctions Netlify.
const crypto = require('crypto');

// Secret dédié aux déclenchements planifiés. CRON_SECRET est à définir dans Netlify ;
// s'il est absent, aucun déclenchement par en-tête n'est accepté (pas de repli sur une autre clé).
function cronSecret() {
  return process.env.CRON_SECRET || '';
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function isCron(headers = {}) {
  const secret = cronSecret();
  if (!secret) return false;
  const key = headers['x-cron-key'] || headers['X-Cron-Key'];
  return safeEqual(key, secret);
}

// Appel légitime d'une fonction planifiée : le planificateur Netlify (POST avec corps JSON contenant next_run)
// ou un appel manuel portant l'en-tête x-cron-key valide.
function isSchedulerCall(event) {
  try {
    const b = JSON.parse((event && event.body) || '');
    if (b && typeof b === 'object' && 'next_run' in b) return true;
  } catch {}
  return isCron((event && event.headers) || {});
}

function bearer(headers = {}) {
  return String(headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
}

// Limitation de débit : compteur par fenêtre dans Supabase (fonction check_rate_limit, service_role).
// Clé = nom + empreinte salée de l'IP (l'IP elle-même n'est jamais stockée). Échec ouvert par défaut ;
// avec { failClosed: true } (6e argument), l'appel est refusé si la base ne répond pas.
function rateSalt() {
  if (process.env.RATE_LIMIT_SALT) return process.env.RATE_LIMIT_SALT;
  return crypto.createHmac('sha256', 'rate-limit-salt-v1').update(process.env.SUPABASE_SERVICE_ROLE_KEY || '').digest('hex');
}
async function rateLimit(event, name, max, windowSeconds, extraKey = '', opts = {}) {
  const failClosed = !!(opts && opts.failClosed);
  try {
    const h = event.headers || {};
    const ip = h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || 'inconnue';
    const salt = rateSalt();
    const id = crypto.createHmac('sha256', salt).update(ip + '|' + extraKey).digest('hex').slice(0, 32);
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: `${name}:${id}`, p_max: max, p_window_seconds: windowSeconds }),
    });
    if (!r.ok) return !failClosed;
    return (await r.json()) !== false;
  } catch { return !failClosed; }
}

const TOO_MANY = { statusCode: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '600' }, body: '{"error":"Trop de requêtes, réessayez plus tard."}' };

module.exports = { isSchedulerCall, cronSecret, safeEqual, isCron, bearer, rateLimit, TOO_MANY };
