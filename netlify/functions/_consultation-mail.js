// Envoi des e-mails d'annonce / de rappel d'une consultation (Brevo transactionnel, un message par destinataire).
const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Paris' });

function buildHtml(c, kind, siteUrl) {
  // Message volontairement sobre (texte, un seul lien, aucune image ni bouton) : les messageries le classent
  // dans la boîte principale plutôt que dans l'onglet Promotions.
  const url = `${siteUrl}/vote.html?id=${encodeURIComponent(c.id)}`;
  const intro = kind === 'rappel'
    ? `Un petit rappel : la consultation « ${esc(c.titre)} » se termine le ${esc(fmtDate(c.date_cloture))} et nous n'avons pas encore votre réponse.`
    : `Le bureau de Générations Médecins souhaite recueillir votre avis sur « ${esc(c.titre)} ». La consultation est ouverte jusqu'au ${esc(fmtDate(c.date_cloture))}.`;
  const mode = c.mode === 'secret'
    ? 'Votre réponse est secrète : personne ne peut la relier à votre nom.'
    : 'Votre réponse sera associée à votre nom pour le bureau.';
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
<p>Bonjour {{prenom}},</p>
<p>${intro}</p>
<p>${mode}</p>
<p>Pour répondre (2 minutes) : <a href="${esc(url)}">${esc(url)}</a></p>
<p>Merci d'avance,<br>Le bureau de Générations Médecins Île-de-France</p>
</body></html>`;
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
  const subject = kind === 'rappel' ? 'Rappel : votre avis sur « ' + c.titre + ' »' : 'Votre avis sur « ' + c.titre + ' »';
  let expediteur = process.env.CONSULTATION_SENDER_EMAIL || process.env.SENDER_EMAIL;
  let envoyes = 0;
  for (let i = 0; i < dest.length; i += 50) {
    const chunk = dest.slice(i, i + 50);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: process.env.CONSULTATION_SENDER_NAME || process.env.SENDER_NAME || 'Générations Médecins', email: expediteur },
        replyTo: { email: process.env.CONSULTATION_REPLY_TO || process.env.CONSULTATION_SENDER_EMAIL || process.env.SENDER_EMAIL },
        subject, htmlContent: html.replace(/\{\{prenom\}\}/g, ''),
        messageVersions: chunk.map(d => ({
          to: [{ email: d.email }],
          htmlContent: html.replace(/\{\{prenom\}\}/g, esc(d.prenom || '')),
        })),
      }),
    });
    let r2 = res;
    if (!res.ok && expediteur !== process.env.SENDER_EMAIL) {
      // Adresse dédiée non validée chez Brevo : on retombe sur l'adresse habituelle plutôt que de ne rien envoyer
      console.error('Brevo consultation : expéditeur', expediteur, 'refusé, repli sur', process.env.SENDER_EMAIL);
      expediteur = process.env.SENDER_EMAIL;
      r2 = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: process.env.SENDER_NAME || 'Générations Médecins', email: expediteur },
          subject, htmlContent: html.replace(/\{\{prenom\}\}/g, ''),
          messageVersions: chunk.map(d => ({ to: [{ email: d.email }], htmlContent: html.replace(/\{\{prenom\}\}/g, esc(d.prenom || '')) })),
        }),
      });
    }
    if (r2.ok) {
      envoyes += chunk.length;
      let ref = ''; try { ref = JSON.stringify(await r2.json()).slice(0, 200); } catch {}
      console.log('Brevo consultation : accepté', chunk.length, 'message(s)', ref);
    } else {
      let corps = ''; try { corps = (await r2.text()).slice(0, 300); } catch {}
      console.error('Brevo consultation :', r2.status, corps);
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
