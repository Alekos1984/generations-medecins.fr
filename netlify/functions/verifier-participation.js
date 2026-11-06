/**
 * Netlify Function - Vérification d'une participation par référence
 *
 * Vérifie si une référence de déclaration existe dans greve_declarations
 * pour une organisation donnée (identifiée par slug).
 *
 * Body attendu : { orgSlug: string, ref: string }
 * Réponse      : { found: boolean, orgNom: string }
 *
 * Env vars : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

'use strict';

const SB  = process.env.SUPABASE_URL;
const SSK = process.env.SUPABASE_SERVICE_ROLE_KEY;

function srvHeaders(extra = {}) {
  return {
    apikey: SSK,
    Authorization: `Bearer ${SSK}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Pre-flight CORS
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  if (!SB || !SSK) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuration Supabase manquante' }) };
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) };
  }

  const { orgSlug, ref } = body;

  // ── Validation des inputs ─────────────────────────────────────────────────
  if (!orgSlug || typeof orgSlug !== 'string' || orgSlug.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'orgSlug requis' }) };
  }
  if (!ref || typeof ref !== 'string' || ref.trim().length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'ref requis' }) };
  }

  const cleanSlug = orgSlug.trim().toLowerCase();
  const cleanRef  = ref.trim().toUpperCase();

  // Validation format de la référence (ORG-XXXXX ou GM-GREVE-YYYY-XXXXX)
  if (!/^[A-Z]+-[A-Z0-9]+(-[A-Z0-9]+)*$/.test(cleanRef)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Format de référence invalide' }) };
  }

  // ── 1. Récupérer l'organisation par slug ──────────────────────────────────
  const orgRes = await fetch(
    `${SB}/rest/v1/organisations?slug=eq.${encodeURIComponent(cleanSlug)}&select=id,nom,actif`,
    { headers: srvHeaders() }
  );

  if (!orgRes.ok) {
    const errText = await orgRes.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur Supabase', detail: errText.slice(0, 200) }) };
  }

  const orgs = await orgRes.json();
  const org  = Array.isArray(orgs) ? orgs[0] : null;

  if (!org) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Organisation introuvable' }) };
  }

  // ── 2. Chercher la déclaration par ref et org_id ──────────────────────────
  const declRes = await fetch(
    `${SB}/rest/v1/greve_declarations?ref=eq.${encodeURIComponent(cleanRef)}&org_id=eq.${encodeURIComponent(org.id)}&select=id,ref&limit=1`,
    { headers: srvHeaders() }
  );

  if (!declRes.ok) {
    const errText = await declRes.text();
    return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erreur lors de la vérification', detail: errText.slice(0, 200) }) };
  }

  const declarations = await declRes.json();
  const found = Array.isArray(declarations) && declarations.length > 0;

  // ── 3. Réponse ────────────────────────────────────────────────────────────
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      found,
      orgNom: org.nom || '',
    }),
  };
};
