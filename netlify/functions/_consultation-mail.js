// Envoi des e-mails d'annonce / de rappel d'une consultation (Brevo transactionnel, un message par destinataire).
const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

function buildHtml(c, kind, siteUrl) {
  const url = `${siteUrl}/vote.html?id=${encodeURIComponent(c.id)}`;
  const intro = kind === 'rappel'
    ? `Rappel : la consultation ci-dessous se termine le <strong>${esc(fmtDate(c.date_cloture))}</strong> et vous n'avez pas encore voté.`
    : `Une nouvelle consultation des adhérents est ouverte jusqu'au <strong>${esc(fmtDate(c.date_cloture))}</strong>.`;
  const mode = c.mode === 'secret'
    ? 'Le vote est <strong>secret</strong> : personne ne peut relier votre choix à votre nom.'
    : 'Le vote est <strong>nominatif</strong> : votre choix sera associé à votre nom pour le bureau.';
  return `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="background:#fff;border-radius:16px;padding:30px 28px">
    <p style="font-size:13px;color:#64748b;margin:0 0 6px">Générations Médecins Île-de-France</p>
    <h1 style="font-size:20px;color:#152033;margin:0 0 16px">${esc(c.titre)}</h1>
    <p style="font-size:14px;color:#152033;line-height:1.6">Bonjour {{prenom}},<br><br>${intro}<br><br>${mode}</p>
    <div style="text-align:center;margin:26px 0">
      <a href="${esc(url)}" style="display:inline-block;background:#1a4a80;color:#fff;padding:13px 26px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none">Voter →</a>
    </div>
    <p style="font-size:12px;color:#94a3b8;line-height:1.5;margin:0">Message de fonctionnement du syndicat, adressé aux adhérents actifs. Les résultats seront publiés après la clôture, avec le taux de participation.</p>
  </div>
</div></body></html>`;
}

async function destinataires(consultationId, nonVotants) {
  const r = await fetch(`${SB()}/rest/v1/rpc/consultation_destinataires`, {
    method: 'POST', headers: srv(), body: JSON.stringify({ p_id: consultationId, p_non_votants: nonVotants }),
  });
  return r.ok ? r.json() : [];
}

async function sendBatch(c, kind) {
  if (!process.env.BREVO_API_KEY || !process.env.SENDER_EMAIL) throw new Error('Configuration e-mail manquante');
  const siteUrl = process.env.URL || 'https://generations-medecins.fr';
  const dest = await destinataires(c.id, kind === 'rappel');
  const html = buildHtml(c, kind, siteUrl);
  const subject = (kind === 'rappel' ? 'Rappel : ' : 'Consultation : ') + c.titre;
  let envoyes = 0;
  for (let i = 0; i < dest.length; i += 50) {
    const chunk = dest.slice(i, i + 50);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        subject, htmlContent: html.replace(/\{\{prenom\}\}/g, ''),
        messageVersions: chunk.map(d => ({
          to: [{ email: d.email }],
          htmlContent: html.replace(/\{\{prenom\}\}/g, esc(d.prenom || '')),
        })),
      }),
    });
    if (res.ok) {
      envoyes += chunk.length;
      let ref = ''; try { ref = JSON.stringify(await res.json()).slice(0, 200); } catch {}
      console.log('Brevo consultation : accepté', chunk.length, 'message(s)', ref);
    } else {
      let corps = ''; try { corps = (await res.text()).slice(0, 300); } catch {}
      console.error('Brevo consultation :', res.status, corps);
    }
  }
  return { destinataires: dest.length, envoyes };
}

async function marquer(id, champ) {
  await fetch(`${SB()}/rest/v1/consultations?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { ...srv(), Prefer: 'return=minimal' }, body: JSON.stringify({ [champ]: true }),
  });
}

module.exports = { sendBatch, marquer, srv, SB };
