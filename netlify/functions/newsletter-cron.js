const { cronSecret, isSchedulerCall } = require('./_security');

/**
 * Netlify Scheduled Function - déclencheur bimensuel de la newsletter auto
 * Cron : 6h UTC le 1er et le 15 du mois (configuré dans netlify.toml)
 *
 * Même pattern que veille-cron : fonction légère (limite 30 s) qui invoque
 * la Background Function generer-newsletter-background (limite 15 min).
 */

exports.handler = async (event) => {
  if (!isSchedulerCall(event)) return { statusCode: 403, body: 'Acces refuse' };
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL;
  if (!base) {
    console.error('Newsletter cron : URL du site introuvable');
    return { statusCode: 500 };
  }

  await fetch(`${base}/.netlify/functions/generer-newsletter-background`, {
    method: 'POST',
    headers: {
      'x-cron-key':   cronSecret(),
      'Content-Type': 'application/json',
    },
    body: '{}',
  }).catch(e => console.error('Newsletter cron : échec invocation', e.message));

  return { statusCode: 200, body: 'Génération newsletter déclenchée' };
};
