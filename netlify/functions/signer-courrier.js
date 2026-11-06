/**
 * Netlify Function - Déclenche la signature électronique d'un courrier.
 *
 * Flux : le membre tape son nom → cette fonction génère un jeton, l'enregistre
 * et envoie un email contenant un lien de confirmation. Cliquer le lien appelle
 * `confirmer-signature` qui appose la signature (double opt-in).
 *
 * Env vars : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
 *            BREVO_API_KEY, SENDER_EMAIL, SENDER_NAME, URL
 */

const SB = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...extra };
}

// Récupère l'utilisateur depuis le JWT, puis son membre_id
async function getMembre(token) {
  if (!token) return null;
  const userRes = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const mRes = await fetch(`${SB}/rest/v1/membres?select=id,email,prenom,nom&user_id=eq.${user.id}`, { headers: srvHeaders() });
  const rows = await mRes.json();
  return rows?.[0] || null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token  = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const membre = await getMembre(token);
  if (!membre) return { statusCode: 403, headers, body: '{"error":"Authentification requise"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' }; }
  const { courrierId, signataireNom } = body;
  if (!courrierId || !signataireNom?.trim()) {
    return { statusCode: 400, headers, body: '{"error":"courrierId et signataireNom requis"}' };
  }

  // Vérifie que le courrier appartient bien au membre
  const cRes = await fetch(
    `${SB}/rest/v1/courriers_generes?select=id,titre,membre_id,statut&id=eq.${courrierId}`,
    { headers: srvHeaders() }
  );
  const courriers = await cRes.json();
  const courrier = courriers?.[0];
  if (!courrier || courrier.membre_id !== membre.id) {
    return { statusCode: 403, headers, body: '{"error":"Courrier introuvable"}' };
  }
  if (courrier.statut === 'signe') {
    return { statusCode: 409, headers, body: '{"error":"Ce courrier est déjà signé"}' };
  }

  // Génère un jeton de signature
  const sigToken = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .replace(/-/g, '') + Math.random().toString(36).slice(2, 8);

  const upd = await fetch(`${SB}/rest/v1/courriers_generes?id=eq.${courrierId}`, {
    method: 'PATCH',
    headers: srvHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ signataire_nom: signataireNom.trim(), signature_token: sigToken }),
  });
  if (!upd.ok) {
    const t = await upd.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur enregistrement jeton', detail: t.slice(0, 200) }) };
  }

  // Construit le lien de confirmation
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://generation-medecins.netlify.app';
  const lien = `${base}/.netlify/functions/confirmer-signature?token=${encodeURIComponent(sigToken)}`;

  // Email transactionnel via Brevo
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;margin:0;padding:0;background:#f0f8f2">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ddeaf0">
    <div style="background:linear-gradient(135deg,#1a4a80,#2a6db8,#38a8b5);padding:28px 32px;text-align:center">
      <span style="color:#fff;font-size:20px;font-weight:800">Signature électronique</span>
    </div>
    <div style="padding:28px 32px;color:#152033">
      <p style="margin:0 0 14px;font-size:15px">Bonjour ${membre.prenom || ''},</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569">
        Vous avez demandé à signer électroniquement le courrier
        « <strong>${courrier.titre}</strong> » sous le nom <strong>${signataireNom.trim()}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475569">
        Pour confirmer votre signature, cliquez sur le bouton ci-dessous.
        La date, l'heure et votre email seront apposés sur le document.
      </p>
      <div style="text-align:center;margin:26px 0">
        <a href="${lien}" style="display:inline-block;background:#2a6db8;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:10px">
          ✍️ Confirmer ma signature
        </a>
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#94a3b8;line-height:1.5">
        Si vous n'êtes pas à l'origine de cette demande, ignorez cet email - aucune signature ne sera apposée.
      </p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:18px">Générations Médecins Île-de-France</p>
</div></body></html>`;

  const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
      to:          [{ email: membre.email, name: `${membre.prenom || ''} ${membre.nom || ''}`.trim() }],
      subject:     `Confirmez la signature de « ${courrier.titre} »`,
      htmlContent: html,
    }),
  });

  if (!brevoRes.ok) {
    const err = await brevoRes.json().catch(() => ({}));
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur envoi email', detail: err }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, email: membre.email }) };
};
