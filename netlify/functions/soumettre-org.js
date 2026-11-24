const { rateLimit, TOO_MANY } = require('./_security');
/**
 * Netlify Function - Soumission d'une déclaration pour les organisations non-médecins
 *
 * Privacy-by-design :
 *   - Reçoit l'identifiant pro en TLS (champ `id`), pseudonymisé côté serveur par HMAC-SHA256
 *     avec un secret serveur ; l'identifiant brut n'est ni stocké ni journalisé
 *   - Email utilisé uniquement pour l'attestation, jamais stocké en base
 *   - Doublon (même identifiant/campagne) : la déclaration existante est conservée telle quelle
 *
 * Body attendu : { orgSlug, campaignId, id, cp, email, source }
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *            SENDER_EMAIL, SENDER_NAME
 */

const crypto = require('crypto');
const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

function pepper() {
  return process.env.RPPS_PEPPER
    || crypto.createHmac('sha256', SSK || '').update('rpps-pepper-v1').digest('hex');
}

function genRef() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
  return 'ORG-' + code;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };
  if (!(await rateLimit(event, 'org', 12, 3600))) return { ...TOO_MANY, headers: { ...headers, 'Retry-After': '600' } };
  if (!SB || !SSK) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service momentanément indisponible' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' };
  }
  // Pot de miel : champ invisible rempli = robot, réponse OK sans rien enregistrer
  if (body && body.website) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ref: 'GM-OK' }) };

  const { orgSlug, campaignId, id, cp, email, source = 'web', contactOptIn = false } = body;

  if (!orgSlug)    return { statusCode: 400, headers, body: JSON.stringify({ error: 'orgSlug requis' }) };
  if (!campaignId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'campaignId requis' }) };
  if (typeof orgSlug !== 'string' || orgSlug.length > 80 || typeof campaignId !== 'string' || campaignId.length > 64)
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données invalides' }) };
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{4,40}$/.test(id.trim()))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Identifiant invalide' }) };
  if (cp != null && cp !== '' && !/^\d{2,5}$/.test(String(cp)))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Code postal invalide' }) };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email invalide' }) };

  // 1. Récupère l'organisation
  const orgRes = await fetch(`${SB}/rest/v1/organisations?slug=eq.${encodeURIComponent(orgSlug)}&select=id,nom,emoji,couleur,actif`, { headers: srvHeaders() });
  const orgs = await orgRes.json();
  const org = Array.isArray(orgs) ? orgs[0] : null;
  if (!org) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Organisation introuvable' }) };
  if (!org.actif) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Cette plateforme n\'est pas encore active.' }) };

  // 2. Récupère et valide la campagne
  const campRes = await fetch(`${SB}/rest/v1/greve_campagnes?id=eq.${encodeURIComponent(campaignId)}&org_id=eq.${encodeURIComponent(org.id)}&select=*`, { headers: srvHeaders() });
  const camps = await campRes.json();
  const camp = Array.isArray(camps) ? camps[0] : null;
  if (!camp) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Campagne introuvable' }) };
  if (!camp.actif) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Les déclarations sont actuellement fermées.' }) };

  const today = new Date().toISOString().slice(0, 10);
  if (camp.date_debut && today < camp.date_debut)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations ouvrent le ${camp.date_debut}.` }) };
  if (camp.date_fin && today > camp.date_fin)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations sont closes depuis le ${camp.date_fin}.` }) };

  // 3. Insertion (référence toujours générée côté serveur ; doublon = déclaration existante conservée)
  const ref = genRef();
  const idHash = crypto.createHmac('sha256', pepper()).update(id.trim() + '|' + campaignId).digest('hex');

  const insRes = await fetch(
    `${SB}/rest/v1/greve_declarations?on_conflict=rpps_hash,campagne_id`,
    {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({
        campagne_id: campaignId,
        org_id:      org.id,
        ref,
        rpps_hash:   idHash,
        cp:          cp || null,
      }),
    }
  );

  if (!insRes.ok) {
    console.error('soumettre-org: insertion refusée', insRes.status);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur enregistrement' }) };
  }

  let inserted = false;
  try { const rows = await insRes.json(); inserted = Array.isArray(rows) && rows.length > 0; } catch { inserted = false; }

  // Contact conservé UNIQUEMENT avec consentement explicite (case dédiée)
  if (contactOptIn === true && email) {
    await fetch(`${SB}/rest/v1/greve_contacts?on_conflict=campagne_id,email`, {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ campagne_id: campaignId, org_id: org.id, email: String(email).trim().toLowerCase() }),
    }).catch(() => {});
  }

  // 4. Email d'attestation (optionnel, best effort)
  let emailEnvoye = false;
  // Limite par destinataire (3 / 24 h), indépendante de l'IP ; échec ouvert si la base ne répond pas
  const mailOk = inserted && email
    ? await rateLimit({ headers: {} }, 'org-mail', 3, 86400, crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex'))
    : false;
  if (mailOk && process.env.BREVO_API_KEY && process.env.SENDER_EMAIL) {
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="background:#fff;border-radius:16px;padding:30px 28px;box-shadow:0 2px 12px rgba(20,32,51,.08)">
    <div style="font-size:2.5rem;margin-bottom:12px">${esc(org.emoji || '✊')}</div>
    <h1 style="font-size:20px;color:#152033;margin:0 0 4px">${esc(org.nom)} - Confirmation de participation</h1>
    <p style="font-size:13px;color:#64748b;margin:0 0 20px">Mouvement : ${esc(camp.titre)}</p>
    <p style="font-size:14px;color:#152033;line-height:1.6">
      Bonjour,<br><br>
      Votre participation au mouvement <strong>${esc(org.nom)}</strong> a bien été enregistrée.<br><br>
      <strong>Référence :</strong> ${esc(ref)}
    </p>
    <div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;margin:20px 0;font-size:13px;color:#166534;line-height:1.6">
      🔒 Votre identifiant professionnel n'est pas conservé : seule une empreinte pseudonymisée
      (calculée avec une clé secrète côté serveur) est enregistrée.
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
      Plateforme de mobilisation hébergée par Générations Médecins Île-de-France.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">
    ${esc(org.nom)} · generations-medecins.fr
  </p>
</div></body></html>`;

    let brevoRes;
    try { brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        to:          [{ email }],
        subject:     `${org.emoji || '✊'} Votre participation est confirmée - ${ref}`,
        htmlContent: html,
      }),
    }); } catch { brevoRes = { ok: false }; }
    emailEnvoye = brevoRes.ok;
    if (!brevoRes.ok) console.error('soumettre-org: envoi e-mail refusé');
  }

  if (!inserted) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, dejaEnregistree: true, message: 'Déclaration déjà enregistrée', emailEnvoye: false }) };
  }
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, ref, emailEnvoye }),
  };
};
