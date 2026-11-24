/**
 * Netlify Scheduled Function - quotidien : clôture automatique des consultations échues
 * et rappel (une seule fois) aux non-votants des consultations qui se terminent dans moins de 48 h.
 */
const { isSchedulerCall } = require('./_security');
const { sendBatch, marquer, srv, SB } = require('./_consultation-mail');

exports.handler = async (event) => {
  if (!isSchedulerCall(event)) return { statusCode: 403, body: 'Acces refuse' };
  if (!SB() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { statusCode: 500 };
  try {
    await fetch(`${SB()}/rest/v1/rpc/consultations_cloture_auto`, { method: 'POST', headers: srv(), body: '{}' });
    const limite = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const r = await fetch(`${SB()}/rest/v1/consultations?statut=eq.ouverte&rappel_envoye=eq.false&date_cloture=lte.${encodeURIComponent(limite)}&date_cloture=gt.${encodeURIComponent(new Date().toISOString())}&select=*`, { headers: srv() });
    const list = r.ok ? await r.json() : [];
    for (const c of list) {
      try { await sendBatch(c, 'rappel'); await marquer(c.id, 'rappel_envoye'); }
      catch (e) { console.error('Rappel consultation :', c.id, e.message); }
    }
  } catch (e) { console.error('Cron consultations :', e.message); return { statusCode: 500 }; }
  return { statusCode: 200, body: 'ok' };
};
