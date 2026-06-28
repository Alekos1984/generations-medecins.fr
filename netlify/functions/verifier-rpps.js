/**
 * Netlify Function — Vérifie qu'un adhérent (ou tous les adhérents) correspond
 * bien à une entrée du RPPS.
 *
 * Stratégie de match (par ordre de priorité) :
 *   1. Numéro RPPS exact si l'adhérent l'a saisi (score 100)
 *   2. Nom + prénom (normalisés sans accents/casse) → si unique : score 90,
 *      si plusieurs résultats, départage par code postal (score 80)
 *   3. Sinon : non_trouve
 *
 * Body : { membreIds?: string[] }   // omis = tous les adhérents
 * Réponse : { results: [{ id, status, ... }] }
 *
 * Env vars : SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */

const SB   = process.env.SUPABASE_URL;
const SSK  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;

function srv(extra = {}) {
  return { apikey: SSK, Authorization: `Bearer ${SSK}`, 'Content-Type': 'application/json', ...extra };
}

async function requireAdmin(token) {
  if (!token) return { ok: false, why: 'pas de token Authorization' };
  if (!SB)   return { ok: false, why: 'SUPABASE_URL non configuré côté serveur' };
  if (!ANON) return { ok: false, why: 'SUPABASE_ANON_KEY non configuré côté serveur' };
  if (!SSK)  return { ok: false, why: 'SUPABASE_SERVICE_ROLE_KEY non configuré côté serveur' };
  const userRes = await fetch(`${SB}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON },
  });
  if (!userRes.ok) return { ok: false, why: `Supabase /auth/v1/user a renvoyé ${userRes.status}` };
  const user = await userRes.json();
  if (!user?.id) return { ok: false, why: 'pas d\'id utilisateur dans la réponse Supabase' };
  const adminRes = await fetch(
    `${SB}/rest/v1/admins?user_id=eq.${user.id}&select=user_id`,
    { headers: srv() },
  );
  if (!adminRes.ok) {
    const t = await adminRes.text();
    return { ok: false, why: `lecture admins échouée ${adminRes.status} : ${t.slice(0,200)}` };
  }
  const rows = await adminRes.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, why: `user_id ${user.id} pas trouvé dans la table admins (vérifie que ton compte a bien une ligne)` };
  }
  return { ok: true, user };
}

// Normalisation : strip accents, upper, trim
function norm(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

async function matchOne(membre) {
  // 1. Match par numéro RPPS exact (le plus fiable)
  if (membre.rpps) {
    const rppsClean = String(membre.rpps).replace(/\s/g, '');
    const r = await fetch(
      `${SB}/rest/v1/rpps_medecins?identifiant_pp=eq.${encodeURIComponent(rppsClean)}&select=*`,
      { headers: srv() },
    );
    const rows = await r.json();
    if (rows && rows.length === 1) {
      return { status: 'verifie', score: 100, identifiant: rows[0].identifiant_pp, details: rows[0], strategy: 'rpps_exact' };
    }
  }

  // 2. Match par nom + prénom normalisés
  const nomU = norm(membre.nom), prenomU = norm(membre.prenom);
  if (!nomU || !prenomU) {
    return { status: 'non_trouve', score: 0, strategy: 'pas_de_nom' };
  }
  const r = await fetch(
    `${SB}/rest/v1/rpps_medecins?nom_upper=eq.${encodeURIComponent(nomU)}&prenom_upper=eq.${encodeURIComponent(prenomU)}&select=*&limit=10`,
    { headers: srv() },
  );
  const rows = await r.json();

  if (!rows || rows.length === 0) {
    return { status: 'non_trouve', score: 0, strategy: 'nom_prenom_introuvable' };
  }
  if (rows.length === 1) {
    return { status: 'verifie', score: 90, identifiant: rows[0].identifiant_pp, details: rows[0], strategy: 'nom_prenom_unique' };
  }
  // Plusieurs résultats : tie-break par code postal
  if (membre.code_postal) {
    const cpExact = rows.find(r => r.code_postal === String(membre.code_postal).trim());
    if (cpExact) {
      return { status: 'verifie', score: 80, identifiant: cpExact.identifiant_pp, details: cpExact, strategy: 'nom_prenom_cp_match' };
    }
    const cpProche = rows.find(r => r.code_departement === String(membre.code_postal).trim().slice(0,2));
    if (cpProche) {
      return { status: 'verifie', score: 70, identifiant: cpProche.identifiant_pp, details: cpProche, strategy: 'nom_prenom_dept_match' };
    }
  }
  return { status: 'multiple', score: 50, identifiant: null,
           details: { candidats: rows.slice(0,5).map(r => ({ id: r.identifiant_pp, cp: r.code_postal, spec: r.libelle_savoir_faire })) },
           strategy: 'plusieurs_homonymes' };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{"error":"Method not allowed"}' };

  const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const auth = await requireAdmin(token);
  if (!auth.ok) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Accès refusé', detail: auth.why }) };
  const user = auth.user;

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  // Garde-fou : si l'index RPPS est vide, le matching ne trouvera évidemment
  // rien. Mieux vaut un message clair que "0 matchés".
  const countRes = await fetch(`${SB}/rest/v1/rpps_medecins?select=identifiant_pp&limit=1`,
    { headers: srv({ Prefer: 'count=exact' }) });
  const contentRange = countRes.headers.get('content-range') || '';
  const total = parseInt(contentRange.split('/')[1] || '0', 10);
  if (!total) {
    return { statusCode: 400, headers, body: JSON.stringify({
      error: 'Index RPPS vide',
      detail: 'La table rpps_medecins ne contient aucune ligne. Lance un import depuis l\'admin observatoire (🚀 Lancer un import) — ça indexe les ~545 000 médecins en fin de run.',
    })};
  }

  // Récupère les membres à vérifier
  let url = `${SB}/rest/v1/membres?select=id,nom,prenom,rpps,code_postal`;
  if (Array.isArray(body.membreIds) && body.membreIds.length) {
    url += `&id=in.(${body.membreIds.map(encodeURIComponent).join(',')})`;
  }
  const mRes = await fetch(url, { headers: srv() });
  if (!mRes.ok) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur lecture membres', detail: (await mRes.text()).slice(0,200) }) };
  }
  const membres = await mRes.json();

  // Match séquentiel (rapide car indexé)
  const results = [];
  for (const m of membres) {
    const match = await matchOne(m);
    // Met à jour le membre avec le résultat
    await fetch(`${SB}/rest/v1/membres?id=eq.${m.id}`, {
      method: 'PATCH',
      headers: srv({ Prefer: 'return=minimal' }),
      body: JSON.stringify({
        rpps_match_status:      match.status,
        rpps_match_identifiant: match.identifiant,
        rpps_match_score:       match.score,
        rpps_match_details:     match.details || null,
        rpps_match_at:          new Date().toISOString(),
        // Si match parfait par RPPS exact, on flag rpps_verifie=true
        rpps_verifie:           match.strategy === 'rpps_exact',
      }),
    });
    results.push({ id: m.id, nom: m.nom, prenom: m.prenom, ...match });
  }

  return { statusCode: 200, headers, body: JSON.stringify({
    n_checked: results.length,
    n_verifie: results.filter(r => r.status === 'verifie').length,
    n_multiple: results.filter(r => r.status === 'multiple').length,
    n_non_trouve: results.filter(r => r.status === 'non_trouve').length,
    results,
  })};
};
