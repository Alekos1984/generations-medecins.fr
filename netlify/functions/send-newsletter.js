/**
 * Netlify Function - Envoi newsletter via Brevo Campaign API
 *
 * Env vars requis dans Netlify :
 *   BREVO_API_KEY          clé API Brevo
 *   NEWSLETTER_LIST_ID     ID de la liste Brevo adhérents (ex: 3)
 *   SENDER_EMAIL           ex: newsletter@generations-medecins.fr
 *   SENDER_NAME            ex: Générations Médecins
 *   SUPABASE_URL           https://faegpfkhlkkwmtaichin.supabase.co
 *   SUPABASE_ANON_KEY      clé anon publique Supabase
 *   SUPABASE_SERVICE_ROLE_KEY  clé service-role (jamais exposée côté client)
 */

async function verifySuperAdmin(token) {
  if (!token) return null;

  // Récupérer l'utilisateur depuis le JWT Supabase
  const userRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY,
    },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;

  // Vérifier role = super_admin via service role (bypasse RLS)
  const adminRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/admins?select=role&user_id=eq.${user.id}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
    }
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

  const resolvedListId = parseInt(listId || process.env.NEWSLETTER_LIST_ID);

  // 1) Créer la campagne
  const createRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `Newsletter ${new Date().toISOString().slice(0, 10)} - ${subject.slice(0, 40)}`,
      subject,
      sender: {
        name: process.env.SENDER_NAME || 'Générations Médecins',
        email: process.env.SENDER_EMAIL,
      },
      htmlContent,
      recipients: { listIds: [resolvedListId] },
    }),
  });

  const campaign = await createRes.json();
  if (!createRes.ok || !campaign.id) {
    console.error('Brevo create error:', campaign);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur création campagne Brevo', detail: campaign }) };
  }

  // 2) Envoyer immédiatement
  const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaign.id}/sendNow`, {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY },
  });

  if (!sendRes.ok) {
    const err = await sendRes.json().catch(() => ({}));
    console.error('Brevo send error:', err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur envoi campagne Brevo', detail: err }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, campaignId: campaign.id }),
  };
};
