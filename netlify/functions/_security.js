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

module.exports = { cronSecret, safeEqual, isCron, bearer };
