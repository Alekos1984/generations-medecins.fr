/**
 * Netlify Function - Soumission d'une déclaration de grève
 *
 * Architecture privacy-by-design :
 *   - Reçoit un rppsHash (SHA-256 calculé côté client) - jamais le RPPS brut
 *   - Email/tel utilisés uniquement pour envoyer l'attestation, JAMAIS stockés en base
 *   - UPSERT : une nouvelle déclaration avec le même hash remplace la précédente
 *
 * Flux :
 *   1. Vérifie la campagne active et la plage de dates
 *   2. UPSERT de la déclaration (dedup via rpps_hash/campagne_id)
 *   3. Si wantsAttestation + email + PDF → envoie l'attestation (Brevo)
 *   4. Si email → inscrit à la liste mobilisation Brevo (best effort)
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY,
 *            SENDER_EMAIL, SENDER_NAME, GREVE_LIST_ID (optionnel)
 */

const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

function genRef() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `GM-GREVE-${year}-${code}`;
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

  const {
    campagneId, rppsHash, specialite, cp, modeExercice, motifs = [],
    email, tel, wantsAttestation = false, estInterne = false, pdfBase64,
    ref: clientRef,
  } = body;

  if (!campagneId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campagne non précisée' }) };

  // Validation hash : 64 chars hex, ou null pour les internes
  if (!estInterne && (!rppsHash || !/^[a-f0-9]{64}$/.test(rppsHash))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Empreinte RPPS invalide (ou cochez « interne/externe sans RPPS »)' }) };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse email invalide' }) };
  }

  // 1. Vérifie la campagne
  const campRes = await fetch(`${SB}/rest/v1/greve_campagnes?id=eq.${encodeURIComponent(campagneId)}&select=*`, { headers: srvHeaders() });
  const camps = await campRes.json();
  const camp = Array.isArray(camps) ? camps[0] : null;
  if (!camp) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Campagne introuvable' }) };
  if (!camp.actif) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Les déclarations sont actuellement fermées.' }) };

  const today = new Date().toISOString().slice(0, 10);
  if (camp.date_debut && today < camp.date_debut)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations ouvrent le ${camp.date_debut}.` }) };
  if (camp.date_fin && today > camp.date_fin)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations sont closes depuis le ${camp.date_fin}.` }) };

  // 2. UPSERT - une re-déclaration avec le même hash met à jour les données
  const ref = (typeof clientRef === 'string' && /^GM-GREVE-\d{4}-[A-Z0-9]{5}$/.test(clientRef))
    ? clientRef : genRef();

  const insRes = await fetch(
    `${SB}/rest/v1/greve_declarations?on_conflict=rpps_hash,campagne_id`,
    {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({
        campagne_id: campagneId,
        ref,
        rpps_hash: estInterne ? null : rppsHash,
        specialite: specialite || null,
        cp: cp || null,
        mode_exercice: modeExercice || null,
        motifs,
        // email et tel ne sont JAMAIS insérés en base
      }),
    }
  );

  if (!insRes.ok) {
    const errText = await insRes.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur enregistrement', detail: errText.slice(0, 200) }) };
  }

  // 3. Envoi de l'attestation (éphémère - email jamais persisté)
  let emailEnvoye = false;
  if (wantsAttestation && email && pdfBase64 && process.env.BREVO_API_KEY && process.env.SENDER_EMAIL) {
    const html = `<!DOCTYPE html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:28px 18px">
    <div style="background:#fff;border-radius:16px;padding:30px 28px;box-shadow:0 2px 12px rgba(20,32,51,.08)">
      <h1 style="font-size:20px;color:#152033;margin:0 0 4px">Votre attestation de grève</h1>
      <p style="font-size:13px;color:#64748b;margin:0 0 20px">Mouvement : ${escapeHtml(camp.titre)}</p>
      <p style="font-size:14px;color:#152033;line-height:1.6">
        Bonjour,<br><br>
        Merci d'avoir déclaré votre participation au mouvement. Votre attestation de grève est jointe à cet email au format PDF.<br><br>
        <strong>Référence :</strong> ${ref}
      </p>
      <div style="background:#eff6ff;border-radius:10px;padding:14px 16px;margin:20px 0;font-size:13px;color:#1e40af;line-height:1.6">
        💪 <strong>Générations Médecins</strong> défend la médecine libérale au quotidien.
        Si vous n'êtes pas encore adhérent, rejoignez-nous :
        <a href="https://generations-medecins.fr/adherer.html" style="color:#2563eb;font-weight:700">adhérer →</a>
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
        Vous recevez cet email car vous avez déclaré une intention de grève sur generations-medecins.fr.
        Vous pouvez vous désinscrire à tout moment via le lien présent dans nos emails.
      </p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">Générations Médecins Île-de-France · Médecins en Grève</p>
  </div></body></html>`;

    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
        to:          [{ email }],
        subject:     `Votre attestation de grève - ${ref}`,
        htmlContent: html,
        attachment:  [{ content: pdfBase64.replace(/^data:application\/pdf;base64,/, ''), name: `attestation-greve-${ref}.pdf` }],
      }),
    });
    emailEnvoye = brevoRes.ok;
  }

  // 4. Inscription liste Brevo (best effort - opt-in implicite si email fourni)
  if (email && process.env.BREVO_API_KEY && process.env.GREVE_LIST_ID) {
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        listIds: [parseInt(process.env.GREVE_LIST_ID, 10)],
        updateEnabled: true,
        attributes: { SPECIALITE: specialite || '', CP: cp || '' },
      }),
    }).catch(() => {});
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, ref, emailEnvoye }),
  };
};

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
