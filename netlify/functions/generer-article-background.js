/**
 * Netlify Background Function — Génération d'un article (News) par LLM (≤ 15 min)
 *
 * Déclenchée depuis l'admin (section Articles > "✨ Générer automatiquement") :
 * l'admin colle de la matière (liens, notes, texte brut) + une indication
 * d'image facultative, cette fonction :
 *   1. Appelle gpt-4o pour rédiger un article complet (titre, chapô, corps
 *      HTML, catégorie, tags, slug)
 *   2. Génère une image de header (gpt-image-1), l'uploade dans le bucket
 *      Storage `newsletter-images` (déjà utilisé par les News manuelles)
 *   3. Insère l'article dans `news` en brouillon (publie=false)
 *   4. Met à jour la ligne news_auto_briefs (statut, created_news_id)
 *
 * Pas de filesystem local utilisé (l'image passe direct de l'API OpenAI
 * vers Supabase Storage) — cohérent avec l'environnement serverless.
 *
 * Env vars requis : OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
 *                   SUPABASE_SERVICE_ROLE_KEY
 */

const SB = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'newsletter-images';

const sbHeaders = () => ({
  Authorization: `Bearer ${SRK()}`,
  apikey: SRK(),
  'Content-Type': 'application/json',
});

async function verifyAdmin(token) {
  if (!token) return null;
  const userRes = await fetch(`${SB()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const adminRes = await fetch(
    `${SB()}/rest/v1/admins?select=user_id&user_id=eq.${user.id}`,
    { headers: sbHeaders() }
  );
  const admins = await adminRes.json();
  return admins?.[0] ? user : null;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueSlug(base) {
  let slug = base || 'article';
  let suffix = 2;
  while (true) {
    const r = await fetch(`${SB()}/rest/v1/news?slug=eq.${encodeURIComponent(slug)}&select=id`, { headers: sbHeaders() });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) return slug;
    slug = `${base}-${suffix++}`;
  }
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

async function chatJson(model, messages, { temperature = 0.7, maxTokens = 3000 } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`OpenAI ${model} HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI ${model} : réponse vide`);
  return JSON.parse(content);
}

async function writeArticle(rawInput) {
  const system = `Tu rédiges un article pour la page "News" du site du syndicat Générations Médecins Île-de-France (médecins libéraux).

RÈGLES IMPÉRATIVES :
1. Sortie en français, quelle que soit la langue de la matière fournie.
2. RÉ-ÉCRITURE originale : ne traduis pas, ne paraphrase pas mot à mot la matière source. Digère l'information et restitue-la avec ta propre structure et tes propres formulations.
3. Pars du principe que le lecteur ne connaît PAS le sujet : commence par le contextualiser (de quoi s'agit-il, pourquoi ça concerne les médecins libéraux) avant d'entrer dans le détail.
4. Vulgarisation : explique chaque terme technique, sigle ou dispositif la première fois qu'il apparaît.
5. Fidélité stricte : n'invente jamais de chiffre, de date, de citation ou de résultat qui ne figure pas dans la matière fournie. En cas de doute, reste général plutôt que d'inventer un détail précis.
6. Ton : factuel, clair, professionnel, engagé sans être polémique — ce n'est pas la newsletter au vitriol, c'est un article d'information du site.
7. Longueur : 350 à 600 mots.
8. Format du corps : HTML simple avec des balises <p>, <h2> pour les intertitres, <strong> pour l'emphase, <ul><li> si une liste est pertinente. Pas de <html>/<body>, juste le corps.

SORTIE — JSON strict :
{
  "titre": "titre de l'article, informatif, pas racoleur",
  "resume": "chapô de 2-3 phrases repris dans les cartes de la page News",
  "contenu_html": "<p>...</p> ... le corps complet en HTML",
  "categorie": "une valeur parmi : actualite, communique, analyse, evenement, mobilisation",
  "tags": ["3 à 6 mots-clés thématiques ou de spécialité pertinents"],
  "image_prompt": "description en anglais, factuelle et sobre, pour générer une image d'illustration éditoriale (pas de texte dans l'image, pas de visage identifiable)"
}`;

  const user = `Matière fournie par l'admin :\n\n${rawInput.slice(0, 12000)}\n\nRédige l'article maintenant. JSON strict uniquement.`;

  return chatJson('gpt-4o', [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.7, maxTokens: 3000 });
}

async function generateHeroImage(imagePrompt, heroHint) {
  const prompt = [imagePrompt, heroHint].filter(Boolean).join('. ').slice(0, 900);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1536x1024', n: 1 }),
  });
  if (!res.ok) throw new Error(`OpenAI images HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image générée vide');
  return Buffer.from(b64, 'base64');
}

async function uploadHeroImage(buffer, slug) {
  const path = `news/${Date.now()}-${slug}.png`;
  const res = await fetch(`${SB()}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SRK()}`,
      apikey: SRK(),
      'Content-Type': 'image/png',
      'x-upsert': 'false',
    },
    body: buffer,
  });
  if (!res.ok) throw new Error(`Upload Storage HTTP ${res.status} : ${(await res.text()).slice(0, 300)}`);
  return `${SB()}/storage/v1/object/public/${BUCKET}/${path}`;
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function genererArticle(briefId, rawInput, heroHint) {
  const logLines = [];
  const log = (m) => { console.log(m); logLines.push(m); };

  log(`Génération article — brief ${briefId}`);
  const article = await writeArticle(rawInput);
  if (!article.titre || !article.contenu_html) {
    throw new Error(`Rédaction gpt-4o incomplète : ${JSON.stringify(article).slice(0, 300)}`);
  }
  log(`Rédigé : "${article.titre}" (${article.categorie || '?'})`);

  const slug = await uniqueSlug(slugify(article.titre));
  log(`Slug : ${slug}`);

  let imageUrl = null;
  try {
    const buf = await generateHeroImage(article.image_prompt || article.titre, heroHint);
    imageUrl = await uploadHeroImage(buf, slug);
    log(`Image générée et uploadée : ${imageUrl}`);
  } catch (e) {
    log(`⚠ Génération d'image échouée (article créé sans image) : ${e.message}`);
  }

  const insert = {
    titre: String(article.titre).slice(0, 200),
    slug,
    resume: article.resume || null,
    contenu: article.contenu_html,
    categorie: ['actualite','communique','analyse','evenement','mobilisation'].includes(article.categorie)
      ? article.categorie : 'actualite',
    tags: Array.isArray(article.tags) ? article.tags.slice(0, 8) : [],
    image_url: imageUrl,
    auteur: 'Rédaction GM',
    acces: 'public',
    publie: false, // brouillon — l'admin relit et publie depuis la liste Articles
    publie_le: new Date().toISOString().slice(0, 10),
  };

  const insRes = await fetch(`${SB()}/rest/v1/news`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(insert),
  });
  if (!insRes.ok) throw new Error(`Insertion news : HTTP ${insRes.status} ${(await insRes.text()).slice(0, 200)}`);
  const newsRow = (await insRes.json())[0];
  log(`✓ Article ${newsRow.id} créé en brouillon`);

  await fetch(`${SB()}/rest/v1/news_auto_briefs?id=eq.${briefId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ statut: 'done', created_news_id: newsRow.id, log: logLines.join('\n').slice(0, 8000) }),
  });

  return { ok: true, newsId: newsRow.id, titre: insert.titre };
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
  const user = await verifyAdmin(token);
  if (!user) return { statusCode: 403, body: JSON.stringify({ error: 'Accès réservé aux administrateurs' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: JSON.stringify({ error: 'JSON invalide' }) }; }
  const rawInput = (body.rawInput || '').trim();
  const heroHint = (body.heroHint || '').trim();
  if (rawInput.length < 20) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Matière trop courte (min. 20 caractères)' }) };
  }

  // Crée le brief tout de suite (statut='generating') pour que l'admin puisse
  // le suivre en polling même si la génération plante en cours de route.
  const briefRes = await fetch(`${SB()}/rest/v1/news_auto_briefs`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ raw_input: rawInput, hero_hint: heroHint || null, statut: 'generating', created_by: user.id }),
  });
  if (!briefRes.ok) return { statusCode: 500, body: JSON.stringify({ error: 'Impossible de créer le brief' }) };
  const brief = (await briefRes.json())[0];

  try {
    const result = await genererArticle(brief.id, rawInput, heroHint);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error('Génération article — échec :', e.message);
    await fetch(`${SB()}/rest/v1/news_auto_briefs?id=eq.${brief.id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ statut: 'error', erreur: e.message.slice(0, 1000) }),
    }).catch(() => {});
    return { statusCode: 500, body: JSON.stringify({ error: e.message, briefId: brief.id }) };
  }
};
