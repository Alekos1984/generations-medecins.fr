const { rateLimit, TOO_MANY } = require('./_security');
/**
 * Netlify Function - Soumission d'une déclaration de grève
 *
 * Architecture privacy-by-design :
 *   - Reçoit le RPPS en TLS (champ `rpps`), le pseudonymise côté serveur par HMAC-SHA256
 *     avec un secret serveur (RPPS_PEPPER) ; le numéro brut n'est ni stocké ni journalisé
 *   - Email/tel utilisés uniquement pour envoyer l'attestation, JAMAIS stockés en base
 *   - Doublon (même empreinte/campagne) : la déclaration existante est conservée telle quelle
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

const crypto = require('crypto');
const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

// Pseudonymisation : HMAC-SHA256(pepper, id|campagne). Pepper dédié, ou dérivé de la clé de service.
function pepper() {
  return process.env.RPPS_PEPPER
    || crypto.createHmac('sha256', SSK || '').update('rpps-pepper-v1').digest('hex');
}
function pseudo(id, campagneId) {
  return crypto.createHmac('sha256', pepper()).update(String(id).trim() + '|' + campagneId).digest('hex');
}

// PDF : base64 valide, en-tête %PDF- et %%EOF dans les 1024 derniers octets
function pdfValide(b64) {
  if (typeof b64 !== 'string' || b64.length > 500000 || b64.length < 8) return false;
  const clean = b64.replace(/^data:application\/pdf;base64,/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean) || clean.length % 4 !== 0) return false;
  const buf = Buffer.from(clean, 'base64');
  if (buf.length < 16) return false;
  return buf.subarray(0, 5).toString('latin1') === '%PDF-'
    && buf.subarray(Math.max(0, buf.length - 1024)).toString('latin1').includes('%%EOF');
}

function genRef() {
  const year = new Date().getFullYear();
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[crypto.randomInt(chars.length)];
  return `GM-GREVE-${year}-${code}`;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };
  if (!(await rateLimit(event, 'greve', 12, 3600))) return { ...TOO_MANY, headers: { ...headers, 'Retry-After': '600' } };
  if (!SB || !SSK) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Service momentanément indisponible' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch {
    return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' };
  }
  // Pot de miel : champ invisible rempli = robot, réponse OK sans rien enregistrer
  if (body && body.website) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, ref: 'GM-OK' }) };

  const {
    campagneId, rpps, specialite, cp, modeExercice, motifs = [],
    email, tel, wantsAttestation = false, estInterne = false, pdfBase64,
    ref: clientRef, contactOptIn = false,
  } = body;

  if (!campagneId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campagne non précisée' }) };

  if (typeof campagneId !== 'string' || campagneId.length > 64) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Campagne non précisée' }) };
  // RPPS : 11 chiffres (sauf internes/externes sans RPPS)
  if (!estInterne && !(typeof rpps === 'string' && /^\d{11}$/.test(rpps.trim()))) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Numéro RPPS invalide (ou cochez « interne/externe sans RPPS »)' }) };
  }
  if (modeExercice != null && modeExercice !== '' && !['liberal', 'hospitalier', 'salarie', 'mixte'].includes(modeExercice)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données invalides' }) };
  }
  // Anti-injection de formules (tableurs) : retire les caractères = + - @ en tête
  const specClean = typeof specialite === 'string' ? specialite.replace(/^[=+\-@\s]+/, '').trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Adresse email invalide' }) };
  }
  // Bornes de taille / type : évite la pollution de la base et les pièces jointes arbitraires
  const tooLong = (v, n) => v != null && (typeof v !== 'string' || v.length > n);
  if (tooLong(specialite, 120) || (cp != null && !/^\d{2,5}$/.test(String(cp)))
      || !Array.isArray(motifs) || motifs.length > 20 || motifs.some(m => typeof m !== 'string' || m.length > 300)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données invalides' }) };
  }
  if (pdfBase64 != null && !pdfValide(pdfBase64)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Pièce jointe invalide' }) };
  }

  // 1. Vérifie la campagne
  const campRes = await fetch(`${SB}/rest/v1/greve_campagnes?id=eq.${encodeURIComponent(campagneId)}&select=*`, { headers: srvHeaders() });
  const camps = await campRes.json();
  const camp = Array.isArray(camps) ? camps[0] : null;
  if (!camp) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Campagne introuvable' }) };
  if (camp.org_id) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Campagne introuvable' }) };
  if (!camp.actif) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Les déclarations sont actuellement fermées.' }) };

  const today = new Date().toISOString().slice(0, 10);
  if (camp.date_debut && today < camp.date_debut)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations ouvrent le ${camp.date_debut}.` }) };
  if (camp.date_fin && today > camp.date_fin)
    return { statusCode: 403, headers, body: JSON.stringify({ error: `Les déclarations sont closes depuis le ${camp.date_fin}.` }) };

  // 2. Insertion - un doublon (même empreinte/campagne) conserve la déclaration existante
  const ref = (typeof clientRef === 'string' && /^GM-GREVE-\d{4}-[A-Z0-9]{5}$/.test(clientRef))
    ? clientRef : genRef();

  const insRes = await fetch(
    `${SB}/rest/v1/greve_declarations?on_conflict=rpps_hash,campagne_id`,
    {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({
        campagne_id: campagneId,
        ref,
        rpps_hash: estInterne ? null : pseudo(rpps, campagneId),
        specialite: specClean || null,
        cp: cp || null,
        mode_exercice: modeExercice || null,
        motifs,
        // email et tel ne sont JAMAIS insérés en base
      }),
    }
  );

  if (!insRes.ok) {
    console.error('soumettre-greve: insertion refusée', insRes.status);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur enregistrement' }) };
  }

  let inserted = false;
  try { const rows = await insRes.json(); inserted = Array.isArray(rows) && rows.length > 0; } catch { inserted = false; }

  // 3. Envoi de l'attestation (éphémère - email jamais persisté), uniquement pour une nouvelle déclaration
  let emailEnvoye = false;
  // Limite par destinataire (3 / 24 h), indépendante de l'IP ; échec ouvert si la base ne répond pas
  const mailOk = inserted && wantsAttestation && email && pdfBase64
    ? await rateLimit({ headers: {} }, 'greve-mail', 3, 86400, crypto.createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex'))
    : false;
  if (mailOk && process.env.BREVO_API_KEY && process.env.SENDER_EMAIL) {
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

    try {
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
    if (!brevoRes.ok) console.error('soumettre-greve: envoi e-mail refusé', brevoRes.status);
    } catch (e) { console.error('soumettre-greve: envoi e-mail en échec'); }
  }

  // Contact conservé UNIQUEMENT si la personne a coché la case de consentement dédiée (séparée de l'attestation)
  if (contactOptIn === true && email) {
    const lower = String(email).trim().toLowerCase();
    await fetch(`${SB}/rest/v1/greve_contacts?on_conflict=campagne_id,email`, {
      method: 'POST',
      headers: srvHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ campagne_id: campagneId, org_id: null, email: lower }),
    }).catch(() => {});
    if (process.env.BREVO_API_KEY && process.env.GREVE_LIST_ID) {
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lower, listIds: [parseInt(process.env.GREVE_LIST_ID, 10)], updateEnabled: true }),
      }).catch(() => {});
    }
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

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
