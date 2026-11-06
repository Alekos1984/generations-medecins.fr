/**
 * Netlify Function - Retourne les listes de contacts Brevo
 * Utilisé par l'admin pour peupler les dropdowns liste newsletter / presse.
 *
 * Env vars requis : BREVO_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
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

  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const user = await verifySuperAdmin(token);
  if (!user) return { statusCode: 403, headers, body: '{"error":"Accès réservé aux super-admins"}' };

  const res = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50', {
    headers: { 'api-key': process.env.BREVO_API_KEY },
  });
  const data = await res.json();
  if (!res.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur Brevo', detail: data }) };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(data.lists || []),
  };
};
