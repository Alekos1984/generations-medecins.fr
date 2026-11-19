/**
 * Netlify Function - Suppression des comptes d'authentification sans fiche adhérent (admin uniquement)
 * POST { action: 'delete' }
 * Un compte est "orphelin" s'il n'a ni fiche adhérent, ni rôle admin, ni rattachement à une organisation,
 * et qu'il a plus de 24 h. Sa suppression permet à la personne de refaire son adhésion avec la même adresse.
 */
const { bearer, rateLimit, TOO_MANY } = require('./_security');

const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });
const json = (statusCode, headers, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });
const has = async (table, uid) => {
  const r = await fetch(`${SB()}/rest/v1/${table}?user_id=eq.${uid}&select=user_id&limit=1`, { headers: srv() });
  return r.ok ? (await r.json()).length > 0 : true; // en cas de doute, on considère que le compte est utilisé
};

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
  if (!(await rateLimit(event, 'orphelins', 10, 3600, user.id))) return { ...TOO_MANY, headers };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, headers, { error: 'JSON invalide' }); }
  if (body.action !== 'delete') return json(400, headers, { error: 'Action inconnue' });

  const lr = await fetch(`${SB()}/auth/v1/admin/users?per_page=200`, { headers: srv() });
  if (!lr.ok) return json(502, headers, { error: 'Liste des comptes indisponible' });
  const users = (await lr.json()).users || [];
  const limite = Date.now() - 24 * 3600 * 1000;
  let supprimes = 0;
  for (const u of users) {
    if (new Date(u.created_at).getTime() > limite) continue;
    if (await has('membres', u.id) || await has('admins', u.id) || await has('org_membres', u.id)) continue;
    const dr = await fetch(`${SB()}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers: srv() });
    if (dr.ok) supprimes++;
  }
  return json(200, headers, { ok: true, supprimes });
};
