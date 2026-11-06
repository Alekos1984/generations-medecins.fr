/**
 * Netlify Function - Envoi communiqué de presse via Brevo Campaign API
 * Même logique que send-newsletter.js mais avec sender cdp@...
 *
 * Env vars requis :
 *   BREVO_API_KEY
 *   SENDER_EMAIL_CDP   ex: cdp@generations-medecins.fr
 *   SENDER_NAME        ex: Générations Médecins
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 */

async function verifySuperAdmin(token) {
  if (!token) return null;
  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const adminRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admins?select=role&user_id=eq.${user.id}`,
    { headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY } }
  );
  const admins = await adminRes.json();
  return admins?.[0]?.role === 'super_admin' ? user : null;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const user = await verifySuperAdmin(token);
  if (!user) return { statusCode: 403, headers, body: '{"error":"Accès réservé aux super-admins"}' };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, headers, body: '{"error":"JSON invalide"}' }; }

  const { subject, htmlContent, listId } = body;
  if (!subject?.trim() || !htmlContent?.trim()) {
    return { statusCode: 400, headers, body: '{"error":"Sujet et contenu requis"}' };
  }

  const senderEmail = process.env.SENDER_EMAIL_CDP || process.env.SENDER_EMAIL;
  const senderName  = process.env.SENDER_NAME || 'Générations Médecins';

  const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `CDP ${new Date().toISOString().slice(0, 10)} - ${subject.slice(0, 40)}`,
      subject,
      sender: { name: senderName, email: senderEmail },
      htmlContent,
      recipients: { listIds: [parseInt(listId)] },
    }),
  });

  const campaign = await createRes.json();
  if (!createRes.ok || !campaign.id) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur création campagne Brevo', detail: campaign }) };
  }

  const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY },
  });

  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}));
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur envoi campagne Brevo', detail: err }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true, campaignId: campaign.id }) };
};
