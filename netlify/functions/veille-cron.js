/**
 * Netlify Scheduled Function - déclencheur quotidien de la veille
 * Cron : 5h UTC = 7h Paris (configuré dans netlify.toml)
 *
 * Cette fonction est volontairement légère (limite 30 s pour les scheduled
 * functions). Elle se contente d'invoquer la Background Function
 * `veille-matinale-background` (limite 15 min) qui fait le travail lourd.
 */

exports.handler = async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) {
    console.error('Veille cron : URL du site introuvable');
    return { statusCode: 500 };
  }

  // Invocation fire-and-forget de la Background Function (renvoie 202 aussitôt)
  await fetch(`${base}/.netlify/functions/veille-matinale-background`, {
    method: 'POST',
    headers: {
      'x-cron-key':   process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch(e => console.error('Veille cron : échec invocation', e.message));

  return { statusCode: 200, body: 'Veille déclenchée' };
};
