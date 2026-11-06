/**
 * Netlify Function - Soumission d'une déclaration pour les organisations non-médecins
 *
 * Privacy-by-design :
 *   - Reçoit un idHash (SHA-256 calculé côté client sur l'identifiant pro)
 *   - Email utilisé uniquement pour l'attestation, jamais stocké en base
 *   - UPSERT : même identifiant/campagne → mise à jour, pas doublon
 *
 * Body attendu : { orgSlug, campaignId, idHash, cp, email, ref, source }
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *            SENDER_EMAIL, SENDER_NAME
 */

const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };
  if (!SB || !SSK) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration Supabase manquante' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' };
  }

  const { orgSlug, campaignId, idHash, cp, email, ref: clientRef, source = 'web' } = body;

  if (!orgSlug)    return { statusCode: 400, headers, body: JSON.stringify({ error: 'orgSlug requis' }) };
  if (!campaignId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'campaignId requis' }) };
  if (!idHash || !/^[a-f0-9]{64}$/.test(idHash))
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empreinte identifiant invalide' }) };
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

  // 3. UPSERT déclaration
  const ref = (typeof clientRef === 'string' && /^ORG-[a-z0-9]+$/i.test(clientRef))
    ? clientRef.toUpperCase()
    : 'ORG-' + Date.now().toString(36).toUpperCase();

  const insRes = await fetch(
    `${SB}/rest/v1/greve_declarations?on_conflict=rpps_hash,campagne_id`,
    {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
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
    const errText = await insRes.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur enregistrement', detail: errText.slice(0, 200) }) };
  }

  // 4. Email d'attestation (optionnel, best effort)
  let emailEnvoye = false;
  if (email && process.env.BREVO_API_KEY && process.env.SENDER_EMAIL) {
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
      🔒 Votre identifiant professionnel n'a jamais quitté votre appareil -
      seule son empreinte numérique a été transmise.
    </div>
    <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
      Plateforme de mobilisation hébergée par Générations Médecins Île-de-France.
    </p>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">
    ${esc(org.nom)} · generations-medecins.fr
  </p>
</div></body></html>`;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        to:          [{ email }],
        subject:     `${org.emoji || '✊'} Votre participation est confirmée - ${ref}`,
        htmlContent: html,
      }),
    }).catch(() => ({ ok: false }));
    emailEnvoye = brevoRes.ok;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, ref, emailEnvoye }),
  };
};
