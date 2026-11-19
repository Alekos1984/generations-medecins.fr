/**
 * Netlify Function - Droits RGPD de l'adhérent connecté
 *   POST { action: 'export' }                      -> JSON de toutes ses données
 *   POST { action: 'delete', confirm: 'SUPPRIMER' } -> suppression du compte et des données associées
 * Auth : JWT Supabase de l'utilisateur. Les lectures/suppressions se font avec le service_role,
 * strictement bornées à l'identité du jeton.
 */
const { rateLimit, TOO_MANY, bearer } = require('./_security');

const SB  = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const srv = () => ({ apikey: SRK(), Authorization: `Bearer ${SRK()}`, 'Content-Type': 'application/json' });
const json = (statusCode, headers, obj) => ({ statusCode, headers, body: JSON.stringify(obj) });

async function rest(path) {
  const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: srv() });
  return r.ok ? r.json() : [];
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': process.env.URL || 'https://generations-medecins.fr',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return json(405, headers, { error: 'Method not allowed' });
  if (!SB() || !SRK()) return json(500, headers, { error: 'Configuration serveur manquante' });

  const jwt = bearer(event.headers);
  const uRes = await fetch(`${SB()}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: process.env.SUPABASE_ANON_KEY } });
  const user = uRes.ok ? await uRes.json() : null;
  if (!user?.id) return json(401, headers, { error: 'Authentification requise' });

  if (!(await rateLimit(event, 'mesdonnees', 10, 3600, user.id))) return { ...TOO_MANY, headers };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, headers, { error: 'JSON invalide' }); }

  const uid = encodeURIComponent(user.id);
  const membre = (await rest(`membres?user_id=eq.${uid}&select=*&limit=1`))[0] || null;
  const mid = membre ? encodeURIComponent(membre.id) : null;

  if (body.action === 'export') {
    const data = {
      exporte_le: new Date().toISOString(),
      compte: { id: user.id, email: user.email, cree_le: user.created_at },
      profil: membre,
      adhesions:               mid ? await rest(`adhesions?membre_id=eq.${mid}&select=*`) : [],
      consultations_juridiques: mid ? await rest(`consultations_juridiques?membre_id=eq.${mid}&select=*`) : [],
      courriers:               mid ? await rest(`courriers_generes?membre_id=eq.${mid}&select=id,titre,expediteur,destinataire,objet,contenu,statut,signataire_nom,signe_le,created_at`) : [],
      signatures_mobilisation: mid ? await rest(`signatures_mobilisation?membre_id=eq.${mid}&select=*`) : [],
      petites_annonces:        mid ? await rest(`petites_annonces?membre_id=eq.${mid}&select=*`) : [],
      organisations:           await rest(`org_membres?user_id=eq.${uid}&select=org_id,role,accepted_at,created_at`),
    };
    return json(200, headers, data);
  }

  if (body.action === 'delete') {
    if (body.confirm !== 'SUPPRIMER') return json(400, headers, { error: 'Confirmation manquante' });
    const adm = await rest(`admins?user_id=eq.${uid}&select=user_id&limit=1`);
    if (adm.length) return json(403, headers, { error: 'Un compte administrateur ne peut pas être supprimé ici : contactez le bureau.' });

    // 1. Fichiers du bucket privé « consultations » (dossier = id du membre)
    if (membre) {
      try {
        const lr = await fetch(`${SB()}/storage/v1/object/list/consultations`, {
          method: 'POST', headers: srv(), body: JSON.stringify({ prefix: membre.id, limit: 1000 }),
        });
        const files = lr.ok ? await lr.json() : [];
        const paths = files.filter(f => f.name).map(f => `${membre.id}/${f.name}`);
        if (paths.length) {
          await fetch(`${SB()}/storage/v1/object/consultations`, {
            method: 'DELETE', headers: srv(), body: JSON.stringify({ prefixes: paths }),
          });
        }
      } catch (e) { console.error('Suppression fichiers :', e.message); }
    }

    // 2. Suppression du compte : cascade sur le profil et toutes les données rattachées
    const dr = await fetch(`${SB()}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: srv() });
    if (!dr.ok) { console.error('Suppression compte :', dr.status); return json(502, headers, { error: 'Suppression impossible, contactez le bureau.' }); }
    return json(200, headers, { ok: true });
  }

  return json(400, headers, { error: 'Action inconnue' });
};
