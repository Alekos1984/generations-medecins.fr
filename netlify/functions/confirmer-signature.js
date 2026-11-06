/**
 * Netlify Function - Confirme la signature électronique (lien cliqué dans l'email).
 *
 * GET ?token=XXX → vérifie le jeton, appose signe_le / signe_par, passe statut='signe'
 * et renvoie une page HTML de confirmation.
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, URL
 */

const SB  = process.env.SUPABASE_URL;
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json', ...extra };
}

function page(title, message, ok) {
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
    <a class="btn" href="${base}/espace-membre.html">Retour à mon espace</a>
  </div>
</div></body></html>`;
}

exports.handler = async (event) => {
  const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8' };
  const token = event.queryStringParameters?.token;

  if (!token) {
    return { statusCode: 400, headers: htmlHeaders, body: page('Lien invalide', '<p>Aucun jeton de signature fourni.</p>', false) };
  }

  // Recherche le courrier par jeton
  const cRes = await fetch(
    `${SB}/rest/v1/courriers_generes?select=id,titre,signataire_nom,signe_le,signe_par,membre_id&signature_token=eq.${encodeURIComponent(token)}`,
    { headers: srvHeaders() }
  );
  const rows = await cRes.json();
  const courrier = rows?.[0];

  if (!courrier) {
    return { statusCode: 404, headers: htmlHeaders, body: page('Lien invalide ou expiré', '<p>Ce lien de signature n\'est plus valide.</p>', false) };
  }

  // Déjà signé ?
  if (courrier.signe_le) {
    const d = new Date(courrier.signe_le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
    return {
      statusCode: 200, headers: htmlHeaders,
      body: page('Courrier déjà signé',
        `<p>Le courrier « <strong>${courrier.titre}</strong> » a déjà été signé.</p>
         <div class="sig">Signé électroniquement le ${d}<br>par ${courrier.signe_par}</div>`, true),
    };
  }

  // Récupère l'email du signataire (celui du membre)
  const mRes = await fetch(`${SB}/rest/v1/membres?select=email&id=eq.${courrier.membre_id}`, { headers: srvHeaders() });
  const membres = await mRes.json();
  const email = membres?.[0]?.email || 'inconnu';

  const now = new Date().toISOString();
  const upd = await fetch(`${SB}/rest/v1/courriers_generes?id=eq.${courrier.id}`, {
    method: 'PATCH',
    headers: srvHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ signe_le: now, signe_par: email, statut: 'signe' }),
  });

  if (!upd.ok) {
    return { statusCode: 502, headers: htmlHeaders, body: page('Erreur', '<p>Impossible d\'enregistrer la signature. Réessayez.</p>', false) };
  }

  const d = new Date(now).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
  return {
    statusCode: 200, headers: htmlHeaders,
    body: page('Signature confirmée ✍️',
      `<p>Le courrier « <strong>${courrier.titre}</strong> » est maintenant signé électroniquement.</p>
       <div class="sig"><strong>Signé électroniquement</strong><br>le ${d}<br>par ${email}<br>(${courrier.signataire_nom})</div>`, true),
  };
};
