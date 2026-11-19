/**
 * Netlify Function - Invitation d'un admin délégué pour une organisation
 *
 * Envoie un email d'invitation avec un lien d'onboarding contenant le token.
 * Le token a déjà été créé dans org_membres par le front-end avant l'appel.
 *
 * Body attendu : { email, orgNom, role, token, orgSlug }
 *
 * Env vars : BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, URL (base URL du site)
 */

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getUser(token) {
  if (!token) return null;
  const r = await fetch(`${SB()}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY } });
  if (!r.ok) return null;
  const u = await r.json();
  return u?.id ? u : null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };
  if (!process.env.BREVO_API_KEY || !process.env.SENDER_EMAIL || !SB() || !SRK())
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration serveur manquante' }) };

  // 1. Authentification obligatoire
  const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  const user = await getUser(jwt);
  if (!user) return { statusCode: 401, headers, body: '{"error":"Authentification requise"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' };
  }
  const token = String(body.token || '');
  if (!UUID.test(token)) return { statusCode: 400, headers, body: '{"error":"Paramètres invalides"}' };

  // 2. L'invitation doit exister en base : email, rôle et organisation viennent de la base, jamais du client
  const invRes = await fetch(`${SB()}/rest/v1/org_membres?invite_token=eq.${encodeURIComponent(token)}&accepted_at=is.null&select=email,role,org_id,created_at&limit=1`, { headers: srv() });
  const inv = invRes.ok ? (await invRes.json())[0] : null;
  if (!inv || !inv.email) return { statusCode: 404, headers, body: '{"error":"Invitation introuvable"}' };
  if (Date.now() - new Date(inv.created_at).getTime() > 7 * 24 * 3600 * 1000)
    return { statusCode: 410, headers, body: '{"error":"Invitation expirée"}' };

  // 3. L'appelant doit être admin GM ou admin de cette organisation
  const [gmRes, orgRes] = await Promise.all([
    fetch(`${SB()}/rest/v1/admins?user_id=eq.${user.id}&select=user_id&limit=1`, { headers: srv() }),
    fetch(`${SB()}/rest/v1/org_membres?org_id=eq.${inv.org_id}&user_id=eq.${user.id}&role=eq.admin&select=id&limit=1`, { headers: srv() }),
  ]);
  const isGm  = gmRes.ok  && (await gmRes.json()).length > 0;
  const isOrg = orgRes.ok && (await orgRes.json()).length > 0;
  if (!isGm && !isOrg) return { statusCode: 403, headers, body: '{"error":"Accès refusé"}' };

  const orgRow = await fetch(`${SB()}/rest/v1/organisations?id=eq.${inv.org_id}&select=nom,slug&limit=1`, { headers: srv() });
  const org = orgRow.ok ? (await orgRow.json())[0] : null;
  if (!org) return { statusCode: 404, headers, body: '{"error":"Organisation introuvable"}' };

  const email = inv.email, orgNom = org.nom, orgSlug = org.slug, role = inv.role;

  const siteUrl = process.env.URL || 'https://generations-medecins.fr';
  const onboardingUrl = `${siteUrl}/mockup/mobilisation-admin.html?org=${encodeURIComponent(orgSlug)}&invite=${encodeURIComponent(token)}`;
  const roleLabel = role === 'admin' ? 'Administrateur' : 'Lecteur';

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="background:#fff;border-radius:16px;padding:30px 28px;box-shadow:0 2px 12px rgba(20,32,51,.08)">
    <h1 style="font-size:20px;color:#152033;margin:0 0 4px">Invitation - ${esc(orgNom)}</h1>
    <p style="font-size:13px;color:#64748b;margin:0 0 20px">Plateforme de mobilisation Générations Médecins</p>
    <p style="font-size:14px;color:#152033;line-height:1.6">
      Bonjour,<br><br>
      Vous avez été invité(e) à rejoindre la plateforme <strong>${esc(orgNom)}</strong>
      en tant que <strong>${esc(roleLabel)}</strong>.<br><br>
      Cliquez sur le bouton ci-dessous pour accepter votre invitation et accéder au tableau de bord.
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${esc(onboardingUrl)}"
         style="display:inline-block;background:#1a3a8a;color:#fff;padding:14px 28px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none">
        Accéder au tableau de bord →
      </a>
    </div>
    <div style="background:#f8fafc;border-radius:10px;padding:14px 16px;margin:20px 0;font-size:12px;color:#64748b;line-height:1.6">
      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
      <span style="color:#2563eb;word-break:break-all">${esc(onboardingUrl)}</span>
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
      Vous recevez cet email car un administrateur de la plateforme ${esc(orgNom)}
      vous a invité(e). Si vous n'êtes pas concerné(e), vous pouvez ignorer cet email.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">
    ${esc(orgNom)} · Générations Médecins Île-de-France
  </p>
</div></body></html>`;

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
      to:          [{ email }],
      subject:     `Invitation - ${orgNom} (${roleLabel})`,
      htmlContent: html,
    }),
  });

  if (!brevoRes.ok) {
    console.error('Brevo invitation org :', brevoRes.status);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur envoi email' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
