const { isSchedulerCall } = require('./_security');
/**
 * Netlify Scheduled Function - rappel de conservation des données (tous les 3 ans)
 * Chaque lundi : les adhérents dont les données sont conservées depuis 3 ans (ou depuis le dernier rappel)
 * reçoivent un e-mail les informant que la conservation se poursuit 3 ans de plus, sauf demande contraire
 * (lien direct vers « Mes données » pour supprimer le compte).
 */
const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

exports.handler = async (event) => {
  if (!isSchedulerCall(event)) return { statusCode: 403, body: 'Acces refuse' };
  if (!SB() || !SRK() || !process.env.BREVO_API_KEY || !process.env.SENDER_EMAIL) return { statusCode: 500 };
  const site = process.env.URL || 'https://generations-medecins.fr';
  const r = await fetch(`${SB()}/rest/v1/rpc/membres_conservation_a_rappeler`, { method: 'POST', headers: srv(), body: JSON.stringify({ p_limit: 200 }) });
  const list = r.ok ? await r.json() : [];
  let envoyes = 0;
  for (const m of list) {
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:16px;padding:30px 28px">
<p style="font-size:13px;color:#64748b;margin:0 0 6px">Générations Médecins Île-de-France</p>
<h1 style="font-size:20px;color:#152033;margin:0 0 16px">Vos données personnelles : information</h1>
<p style="font-size:14px;color:#152033;line-height:1.6">Bonjour ${esc(m.prenom || '')},<br><br>
Cela fait trois ans que nous conservons les données de votre compte adhérent. <strong>Sans mention contraire de votre part, nous les conservons trois années de plus</strong>, aux seules fins décrites dans notre <a href="${site}/politique-confidentialite.html">politique de confidentialité</a>.<br><br>
Vous pouvez à tout moment consulter, exporter ou supprimer vos données depuis votre espace, rubrique « Mes données », ou nous répondre directement à ce message pour toute demande.</p>
<div style="text-align:center;margin:24px 0"><a href="${site}/espace-membre.html" style="display:inline-block;background:#1a4a80;color:#fff;padding:12px 24px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none">Gérer mes données</a></div>
</div></div></body></html>`;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        to: [{ email: m.email }], subject: 'Vos données personnelles : information annuelle de conservation', htmlContent: html }),
    }).catch(() => null);
    if (res && res.ok) {
      envoyes++;
      await fetch(`${SB()}/rest/v1/membres?id=eq.${encodeURIComponent(m.id)}`, {
        method: 'PATCH', headers: { ...srv(), Prefer: 'return=minimal' }, body: JSON.stringify({ conservation_rappel_le: new Date().toISOString() }),
      });
    }
  }
  console.log(`Rappels de conservation envoyés : ${envoyes}/${list.length}`);
  return { statusCode: 200, body: 'ok' };
};
