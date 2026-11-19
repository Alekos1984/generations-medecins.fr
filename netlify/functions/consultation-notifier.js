/**
 * Netlify Function - Annonce / rappel d'une consultation (admin uniquement)
 * POST { consultationId, action: 'annonce' | 'rappel' }
 */
const { bearer, rateLimit, TOO_MANY } = require('./_security');
const { sendBatch, marquer, srv, SB } = require('./_consultation-mail');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (statusCode, headers, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return json(405, headers, { error: 'Method not allowed' });

  const jwt = bearer(event.headers);
  const uRes = await fetch(`${SB()}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_ANON_KEY } });
  const user = uRes.ok ? await uRes.json() : null;
  if (!user?.id) return json(401, headers, { error: 'Authentification requise' });
  const adm = await fetch(`${SB()}/rest/v1/admins?user_id=eq.${user.id}&select=user_id&limit=1`, { headers: srv() });
  if (!adm.ok || !(await adm.json()).length) return json(403, headers, { error: 'Réservé aux administrateurs' });
  if (!(await rateLimit(event, 'consult-notif', 20, 3600, user.id))) return { ...TOO_MANY, headers };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, headers, { error: 'JSON invalide' }); }
  const { consultationId, action } = body;
  if (!UUID.test(String(consultationId)) || !['annonce', 'rappel'].includes(action)) return json(400, headers, { error: 'Paramètres invalides' });

  const cr = await fetch(`${SB()}/rest/v1/consultations?id=eq.${consultationId}&select=*&limit=1`, { headers: srv() });
  const c = cr.ok ? (await cr.json())[0] : null;
  if (!c) return json(404, headers, { error: 'Consultation introuvable' });
  if (c.statut !== 'ouverte') return json(409, headers, { error: 'La consultation doit être ouverte' });
  if (action === 'annonce' && c.annonce_envoyee) return json(409, headers, { error: 'Annonce déjà envoyée' });

  try {
    const out = await sendBatch(c, action);
    await marquer(c.id, action === 'annonce' ? 'annonce_envoyee' : 'rappel_envoye');
    return json(200, headers, { ok: true, ...out });
  } catch (e) {
    console.error('Notification consultation :', e.message);
    return json(502, headers, { error: 'Envoi impossible' });
  }
};
