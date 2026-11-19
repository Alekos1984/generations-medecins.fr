/**
 * Netlify Function - E-mail d'invitation à compléter la fiche adhérent (admin uniquement)
 * Destinataires : fiches provisoires (profil_complet = false), issues d'un incident d'inscription.
 */
const { bearer, rateLimit, TOO_MANY } = require('./_security');

const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });
const json = (statusCode, headers, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return json(405, headers, { error: 'Method not allowed' });

  const jwt = bearer(event.headers);
  const uRes = await fetch(`${SB()}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_ANON_KEY } });
  const user = uRes.ok ? await uRes.json() : null;
  if (!user?.id) return json(401, headers, { error: 'Authentification requise' });
  const adm = await fetch(`${SB()}/rest/v1/admins?user_id=eq.${user.id}&select=user_id&limit=1`, { headers: srv() });
  if (!adm.ok || !(await adm.json()).length) return json(403, headers, { error: 'Réservé aux administrateurs' });
  if (!(await rateLimit(event, 'profils-completer', 5, 3600, user.id))) return { ...TOO_MANY, headers };
  if (!process.env.BREVO_API_KEY || !process.env.SENDER_EMAIL) return json(500, headers, { error: 'Configuration e-mail manquante' });

  const lr = await fetch(`${SB()}/rest/v1/membres?profil_complet=eq.false&select=email`, { headers: srv() });
  const list = lr.ok ? await lr.json() : [];
  const site = process.env.URL || 'https://generations-medecins.fr';
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:16px;padding:30px 28px;border-top:5px solid #2a6db8">
<p style="font-size:13px;color:#64748b;margin:0 0 6px">Générations Médecins Île-de-France</p>
<h1 style="font-size:20px;color:#152033;margin:0 0 16px">Finalisez votre adhésion</h1>
<p style="font-size:14px;color:#152033;line-height:1.6">Bonjour,<br><br>
Vous avez créé un compte sur le site de Générations Médecins, mais <strong>un incident technique de notre côté a empêché l'enregistrement de votre fiche d'adhérent</strong>. Nous nous en excusons sincèrement, et nous l'avons corrigé.<br><br>
Il vous suffit de vous connecter avec votre adresse e-mail pour compléter quelques informations (nom, RPPS, spécialité…). Le bureau validera ensuite votre adhésion.<br><br>
Mot de passe oublié ? Cliquez sur « Mot de passe oublié ? » sur la page de connexion.</p>
<div style="text-align:center;margin:24px 0"><a href="${site}/connexion.html" style="display:inline-block;background:#1a4a80;color:#fff;padding:13px 26px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none">Compléter mon profil</a></div>
</div></div></body></html>`;
  let envoyes = 0;
  for (const m of list) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        to: [{ email: m.email }], subject: 'Finalisez votre adhésion à Générations Médecins', htmlContent: html }),
    }).catch(() => null);
    if (r && r.ok) envoyes++;
  }
  return json(200, headers, { ok: true, envoyes });
};
