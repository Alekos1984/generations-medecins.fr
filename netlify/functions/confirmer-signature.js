/**
 * Netlify Function - Confirme la signature électronique (lien cliqué dans l'email).
 *
 * GET ?token=XXX → affiche une page de confirmation (aucune signature, un GET ne signe jamais).
 * POST (formulaire, champ token) → appose signe_le / signe_par, passe statut='signe',
 * invalide le jeton et renvoie une page HTML de confirmation.
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, URL
 */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}


const SB  = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...extra };
}

function page(title, message, ok, noBack) {
  const color = ok ? '#62c040' : '#e74c3c';
  const icon  = ok ? '✓' : '✕';
  const base  = process.env.URL || 'https://generation-medecins.netlify.app';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  body{font-family:'Inter',-apple-system,sans-serif;background:#f0f8f2;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .card{background:#fff;border-radius:18px;border:1px solid #ddeaf0;max-width:480px;width:100%;overflow:hidden;box-shadow:0 12px 48px rgba(23,54,95,.1)}
  .head{background:linear-gradient(135deg,#1a4a80,#2a6db8,#38a8b5);padding:30px;text-align:center}
  .head .badge{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:32px;font-weight:800}
  .body{padding:30px 34px;text-align:center}
  h1{font-size:20px;color:#152033;margin:0 0 12px}
  p{font-size:14px;color:#475569;line-height:1.6;margin:0 0 8px}
  .sig{margin-top:18px;padding:16px;background:#f0f8f2;border-radius:10px;font-size:13px;color:#1a4a80}
  .btn{display:inline-block;margin-top:22px;background:#2a6db8;color:#fff;text-decoration:none;font-weight:700;padding:11px 24px;border-radius:9px;font-size:14px}
</style></head><body>
<div class="card">
  <div class="head"><div class="badge" style="color:${color}">${icon}</div></div>
  <div class="body">
    <h1>${title}</h1>
    ${message}
    ${noBack ? '' : `<a class="btn" href="${base}/espace-membre.html">Retour à mon espace</a>`}
  </div>
</div></body></html>`;
}

exports.handler = async (event) => {
  const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'", 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
  const method = event.httpMethod;
  if (method !== 'GET' && method !== 'POST') {
    return { statusCode: 405, headers: { ...htmlHeaders, Allow: 'GET, POST' }, body: page('Méthode non autorisée', '<p>Requête non prise en charge.</p>', false) };
  }

  let token;
  if (method === 'GET') {
    token = event.queryStringParameters?.token;
  } else {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    token = new URLSearchParams(raw).get('token');
  }

  if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
    return { statusCode: 400, headers: htmlHeaders, body: page('Lien invalide', '<p>Aucun jeton de signature valide fourni.</p>', false) };
  }

  // Recherche le courrier par jeton (un jeton est effacé après signature)
  const cRes = await fetch(
    `${SB}/rest/v1/courriers_generes?select=id,titre,signataire_nom,signe_le,membre_id&signature_token=eq.${encodeURIComponent(token)}`,
    { headers: srvHeaders() }
  );
  const rows = cRes.ok ? await cRes.json() : null;
  const courrier = Array.isArray(rows) ? rows[0] : null;

  if (!courrier) {
    return { statusCode: 404, headers: htmlHeaders, body: page('Lien invalide ou expiré', '<p>Ce lien de signature n\'est plus valide.</p>', false) };
  }

  // Déjà signé : message générique, sans e-mail ni titre
  if (courrier.signe_le) {
    return { statusCode: 200, headers: htmlHeaders, body: page('Courrier déjà signé', '<p>Ce courrier a déjà été signé.</p>', true) };
  }

  // GET : simple page de confirmation, aucune écriture
  if (method === 'GET') {
    const form = `<p>Vous êtes sur le point de signer électroniquement le courrier « <strong>${esc(courrier.titre)}</strong> ».</p>
      <form method="POST" action="">
        <input type="hidden" name="token" value="${esc(token)}">
        <button class="btn" type="submit" style="border:0;cursor:pointer;font-family:inherit">Confirmer la signature</button>
      </form>`;
    return { statusCode: 200, headers: htmlHeaders, body: page('Confirmer la signature', form, true, true) };
  }

  // POST : signature
  const mRes = await fetch(`${SB}/rest/v1/membres?select=email&id=eq.${encodeURIComponent(courrier.membre_id)}`, { headers: srvHeaders() });
  const membres = mRes.ok ? await mRes.json() : null;
  const email = membres?.[0]?.email || 'inconnu';

  const now = new Date().toISOString();
  const upd = await fetch(`${SB}/rest/v1/courriers_generes?id=eq.${encodeURIComponent(courrier.id)}&signe_le=is.null`, {
    method: 'PATCH',
    headers: srvHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ signe_le: now, signe_par: email, statut: 'signe', signature_token: null }),
  });

  if (!upd.ok) {
    console.error('confirmer-signature: PATCH refusé', upd.status);
    return { statusCode: 502, headers: htmlHeaders, body: page('Erreur', '<p>Impossible d\'enregistrer la signature. Réessayez.</p>', false) };
  }

  const d = new Date(now).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  return {
    statusCode: 200, headers: htmlHeaders,
    body: page('Signature confirmée ✍️',
      `<p>Le courrier « <strong>${esc(courrier.titre)}</strong> » est maintenant signé électroniquement.</p>
       <div class="sig"><strong>Signé électroniquement</strong><br>le ${d}<br>par ${esc(email)}<br>(${esc(courrier.signataire_nom)})</div>`, true),
  };
};
