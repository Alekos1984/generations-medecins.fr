/**
 * Netlify Background Function - Génération d'un article (News) par LLM (≤ 15 min)
 *
 * Déclenchée depuis l'admin (section Articles > "✨ Générer automatiquement") :
 * l'admin colle de la matière (liens lus automatiquement, notes, texte brut) + une indication
 * d'image facultative, cette fonction :
 *   1. Appelle gpt-4o pour rédiger un article complet (titre, chapô, corps
 *      HTML, catégorie, tags, slug)
 *   2. Génère une image de header (gpt-image-1), l'uploade dans le bucket
 *      Storage `newsletter-images` (déjà utilisé par les News manuelles)
 *   3. Insère l'article dans `news` en brouillon (publie=false)
 *   4. Met à jour la ligne news_auto_briefs (statut, created_news_id)
 *
 * Pas de filesystem local utilisé (l'image passe direct de l'API OpenAI
 * vers Supabase Storage) - cohérent avec l'environnement serverless.
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


// ── Récupération de liens (LinkedIn, blogs, presse...) ───────────────────────

const dns = require('dns').promises;
const net = require('net');

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

async function assertPublicUrl(u) {
  if (u.protocol !== 'https:') throw new Error('seuls les liens https sont acceptés');
  if (u.port && u.port !== '443') throw new Error('port non autorisé');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('adresse non autorisée');
}

function htmlToText(html) {
  const meta = (name) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
    return m ? m[1] : '';
  };
  const decode = (t) => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  const title = decode(meta('og:title') || (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || '');
  const art = html.match(/<article[\s\S]*?<\/article>/i);
  let body = (art ? art[0] : (html.match(/<body[\s\S]*<\/body>/i) || [html])[0])
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  body = decode(body).replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  const desc = decode(meta('og:description') || meta('description'));
  if (body.length < 400 && desc.length > body.length) body = desc;
  return { title: title.trim(), text: body };
}

async function fetchLinkText(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error('lien invalide'); }
  let current = u;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GM-ArticleBot/1.0)', Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'fr,en;q=0.8' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (!/text\/html|text\/plain|xml/.test(type)) throw new Error('contenu non textuel');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) throw new Error('page trop volumineuse');
    const { title, text } = htmlToText(buf.toString('utf-8'));
    if (/authwall|sign in|join linkedin|se connecter/i.test(text.slice(0, 600)) && text.length < 800) throw new Error('page protégée par une connexion');
    if (text.length < 200) throw new Error('texte introuvable sur la page');
    return { url: u.href, title, text };
  }
  throw new Error('trop de redirections');
}

// Remplace chaque lien de la matière par le texte de la page ; renvoie aussi les alertes
async function enrichWithLinks(rawInput, log) {
  const urls = [...new Set(rawInput.match(/https?:\/\/[^\s<>"')]+/g) || [])].slice(0, 3);
  let enriched = rawInput;
  const failed = [];
  for (const url of urls) {
    try {
      const page = await fetchLinkText(url);
      log(`Lien lu : ${url} (${page.text.length} caractères)`);
      enriched += `\n\n--- CONTENU DU LIEN ${url}${page.title ? ' : ' + page.title : ''} ---\n${page.text.slice(0, 15000)}`;
    } catch (e) {
      log(`⚠ Lien non lu : ${url} (${e.message})`);
      failed.push(`${url} (${e.message})`);
    }
  }
  return { enriched, urls, failed };
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

async function writeArticle(rawInput, ownText) {
  const ownRules = `
MODE TEXTE DE L'AUTEUR : la matière est un texte écrit par l'admin lui-même (ex. article LinkedIn). CONSERVE sa voix, ses idées, ses formulations et sa longueur ; ne ré-écris pas, ne raccourcis pas, n'ajoute aucune information. Tu mets seulement en forme pour le site (paragraphes, intertitres <h2>, emphases, listes), tu corriges les coquilles évidentes et tu produis titre, chapô, catégorie et tags. Les règles 2, 3, 4 et 7 ci-dessus ne s'appliquent pas, la règle 5 reste absolue.\n`;
  const system = `Tu rédiges un article pour la page "News" du site du syndicat Générations Médecins Île-de-France (médecins libéraux).

RÈGLES IMPÉRATIVES :
1. Sortie en français, quelle que soit la langue de la matière fournie.
2. RÉ-ÉCRITURE originale : ne traduis pas, ne paraphrase pas mot à mot la matière source. Digère l'information et restitue-la avec ta propre structure et tes propres formulations.
3. Pars du principe que le lecteur ne connaît PAS le sujet : commence par le contextualiser (de quoi s'agit-il, pourquoi ça concerne les médecins libéraux) avant d'entrer dans le détail.
4. Vulgarisation : explique chaque terme technique, sigle ou dispositif la première fois qu'il apparaît.
5. Fidélité stricte : n'invente jamais de chiffre, de date, de citation ou de résultat qui ne figure pas dans la matière fournie. En cas de doute, reste général plutôt que d'inventer un détail précis.
6. Ton : factuel, clair, professionnel, engagé sans être polémique - ce n'est pas la newsletter au vitriol, c'est un article d'information du site.
7. Longueur : 350 à 600 mots.
8. Format du corps : HTML simple avec des balises <p>, <h2> pour les intertitres, <strong> pour l'emphase, <ul><li> si une liste est pertinente. Pas de <html>/<body>, juste le corps.

RÈGLE ABSOLUE : n'utilise jamais de tiret cadratin (—), ni dans le texte ni dans les titres ; préfère virgules, points ou deux-points.
${ownText ? ownRules : ''}
SORTIE - JSON strict :
{
  "titre": "titre de l'article, informatif, pas racoleur",
  "resume": "chapô de 2-3 phrases repris dans les cartes de la page News",
  "contenu_html": "<p>...</p> ... le corps complet en HTML",
  "categorie": "une valeur parmi : actualite, communique, analyse, evenement, mobilisation",
  "tags": ["3 à 6 mots-clés thématiques ou de spécialité pertinents"],
  "image_prompt": "description en anglais, factuelle et sobre, pour générer une image d'illustration éditoriale (pas de texte dans l'image, pas de visage identifiable)"
}`;

  const user = `Matière fournie par l'admin :\n\n${rawInput.slice(0, 30000)}\n\nRédige l'article maintenant. JSON strict uniquement.`;

  return chatJson('gpt-4o', [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: ownText ? 0.3 : 0.7, maxTokens: ownText ? 6000 : 3000 });
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

async function genererArticle(briefId, rawInput, heroHint, ownText) {
  const logLines = [];
  const log = (m) => { console.log(m); logLines.push(m); };

  log(`Génération article - brief ${briefId}`);
  const { enriched, urls, failed } = await enrichWithLinks(rawInput, log);
  // Matière = uniquement des liens, tous illisibles : inutile d'inventer un article
  const sansLiens = rawInput.replace(/https?:\/\/[^\s<>"')]+/g, '').trim();
  if (failed.length && failed.length === urls.length && sansLiens.length < 200) {
    throw new Error(`Impossible de lire le lien (${failed.join(' ; ')}). LinkedIn bloque souvent la lecture automatique : colle directement le texte de ton article dans la zone.`);
  }
  const article = await writeArticle(enriched, ownText);
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
    publie: false, // brouillon - l'admin relit et publie depuis la liste Articles
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
  const ownText = !!body.ownText;
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
    const result = await genererArticle(brief.id, rawInput, heroHint, ownText);
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error('Génération article - échec :', e.message);
    await fetch(`${SB()}/rest/v1/news_auto_briefs?id=eq.${brief.id}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ statut: 'error', erreur: e.message.slice(0, 1000) }),
    }).catch(() => {});
    return { statusCode: 500, body: JSON.stringify({ error: e.message, briefId: brief.id }) };
  }
};
