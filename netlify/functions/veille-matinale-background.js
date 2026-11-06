/**
 * Netlify Background Function - Veille automatisée (jusqu'à 15 min)
 *
 * Déclenchée :
 *   • automatiquement chaque matin par veille-cron.js (cron 7h Paris)
 *   • manuellement depuis l'admin (bouton « Lancer la veille »)
 *
 * Env vars requis :
 *   OPENAI_API_KEY
 *   BREVO_API_KEY
 *   ADMIN_EMAIL
 *   SENDER_EMAIL
 *   SENDER_NAME
 *   SUPABASE_URL
 *   SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search?q={q}&hl=fr&gl=FR&ceid=FR:fr';

// Flux RSS directs (les plus fiables - on les tente en priorité)
const DIRECT_FEEDS = [];

// Sources via Google News site: (contournement anti-bot + flux directs périmés)
const GN_SITE_QUERIES = [
  { domain: 'lequotidiendumedecin.fr', nom: 'Quotidien du Médecin' },
  { domain: 'jim.fr',                  nom: 'JIM' },
  { domain: 'francais.medscape.com',   nom: 'Medscape' },
  { domain: 'whatsupdoc-lemag.fr',     nom: "What's up Doc" },
  { domain: 'egora.fr',                nom: 'Egora' },
];

// Requêtes thématiques nationales
const TOPIC_QUERIES = [
  'convention médicale médecins CNAM',
  'syndicat médecins libéraux négociation',
  'honoraires médecins secteur conventionnel',
  'CARMF retraite médecins libéraux',
  'PLFSS santé médecins',
];

// Assemblage de tous les flux
const RSS_FEEDS = [
  ...DIRECT_FEEDS,
  ...GN_SITE_QUERIES.map(s => ({
    nom: s.nom,
    url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent(`site:${s.domain}`)),
  })),
  ...TOPIC_QUERIES.map(q => ({
    nom: 'Google News',
    url: GOOGLE_NEWS_BASE.replace('{q}', encodeURIComponent(q)),
  })),
];

const TAGS_ALLOWED = [
  'CCAM/Cotation',
  'Convention médicale',
  'Accès aux soins',
  'Télémédecine',
  'Formation/DPC',
  'Fiscalité/Retraite',
  'Installation/Libéral',
  'Politique de santé',
  'Syndicat',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripHtmlEntities(str) {
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── RSS parsing (minimal, no external deps) ─────────────────────────────────

function parseXml(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1];
    const get = (tag) => {
      const r = new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const x = r.exec(block);
      return x ? (x[1] ?? x[2] ?? '').trim() : '';
    };
    items.push({
      title:       get('title'),
      link:        get('link') || get('guid'),
      pubDate:     get('pubDate'),
      description: get('description'),
      content:     get('content:encoded') || get('description'),
    });
  }
  return items;
}

function isRecent(pubDateStr) {
  if (!pubDateStr) return true;
  try {
    const diff = (Date.now() - new Date(pubDateStr)) / 36e5;
    return diff <= 26; // ~26h : couvre un run quotidien + légère marge
  } catch {
    return true;
  }
}

// ── GPT-4o-mini classification ───────────────────────────────────────────────

async function classifyArticle(article) {
  const description = stripHtmlEntities((article.description || '').replace(/<[\s\S]*?>/g, ' ')).slice(0, 500);

  const prompt = `Tu es assistant éditorial pour le syndicat Générations Médecins IDF (syndicat de médecins libéraux).

Article :
- Titre : ${article.title}
- Source : ${article.nom}
- Résumé : ${description}

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.

RÈGLE FONDAMENTALE : Ce site est un site SYNDICAL pour les médecins libéraux. Il ne publie PAS d'articles de médecine clinique.

1. "pertinent" : true UNIQUEMENT si l'article porte sur l'un de ces sujets :
   ✅ À retenir : convention médicale / honoraires / CCAM / cotation · syndicats de médecins, négociations CNAM · démographie médicale, déserts médicaux, installation · médecine libérale (cabinet, remplacement, MSP) · PLFSS, politique de santé impactant l'exercice · CARMF, retraite, cotisations URSSAF · Ordre des médecins, URPS, représentativité · responsabilité médicale, procédures judiciaires contre des médecins · conditions d'exercice, burn-out des médecins · numerus apertus, formation médicale initiale · télémédecine si enjeu réglementaire/tarifaire

   ❌ À rejeter absolument :
   - Articles purement CLINIQUES : nouvelles recommandations thérapeutiques, études sur des maladies, essais cliniques, congrès de spécialité médicale (allergologie, oncologie, cardiologie…)
   - Articles sur des maladies ou traitements (eczéma, asthme, diabète, cancer, obésité, psychiatrie…) SAUF si l'angle est l'organisation des soins ou les droits des médecins
   - Congrès scientifiques, publications de guidelines cliniques
   - Articles étrangers (Canada, Belgique, Suisse…)
   - Articles purement locaux (une ville, un département)

2. "tags" : entre 1 et 3 tags parmi : ${TAGS_ALLOWED.map(t => JSON.stringify(t)).join(', ')}
3. "resume" : 2-3 phrases factuelles sur l'enjeu pour les médecins libéraux.

Exemple valide : {"pertinent": true, "tags": ["Convention médicale", "Syndicat"], "resume": "La CNAM a ouvert de nouvelles négociations conventionnelles. Les syndicats demandent une revalorisation des honoraires."}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:           'gpt-4o-mini',
      max_tokens:      400,
      response_format: { type: 'json_object' },
      messages:        [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.error('GPT error:', res.status, err?.error?.message || '');
    return null;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  try {
    const parsed = JSON.parse(text);
    if (parsed.tags) {
      parsed.tags = parsed.tags.filter(t => TAGS_ALLOWED.includes(t));
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function urlAlreadyExists(url) {
  const since = new Date(Date.now() - 7 * 24 * 36e5).toISOString();
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/decrypteurs?url=eq.${encodeURIComponent(url)}&auto_import=eq.true&created_at=gte.${since}&select=id&limit=1`,
    {
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function insertDecrypteur(row) {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/decrypteurs`, {
    method: 'POST',
    headers: {
      apikey:         process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization:  `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:         'return=representation',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`Insert failed (${res.status}):`, body.slice(0, 200));
    return null;
  }
  return await res.json();
}

// ── Slug helper ──────────────────────────────────────────────────────────────

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// ── Brevo admin digest ───────────────────────────────────────────────────────

async function sendAdminDigest(imported, stats) {
  if (!process.env.ADMIN_EMAIL) return;

  const siteUrl = 'https://generations-medecins.fr';
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  const articleRows = imported.map(a => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8edf2">
        <strong>${a.titre}</strong><br>
        <span style="font-size:13px;color:#555">${a.source} - ${new Date(a.publie_le).toLocaleDateString('fr-FR')}</span><br>
        <span style="font-size:13px">${a.resume || ''}</span><br>
        ${a.tags?.length ? `<span style="font-size:12px;color:#38a8b5">${a.tags.join(' · ')}</span>` : ''}
      </td>
    </tr>`).join('');

  const errorSection = stats.errors.length ? `
    <div style="background:#fff8f8;border:1px solid #fcc;border-radius:8px;padding:16px;margin-top:16px">
      <strong style="color:#c0392b">⚠ Erreurs (${stats.errors.length})</strong>
      <ul style="margin:8px 0 0;padding-left:20px;font-size:13px;color:#666">
        ${stats.errors.map(e => `<li>${e}</li>`).join('')}
      </ul>
    </div>` : '';

  const statsSection = `
    <div style="background:#f0f7ff;border:1px solid #c5d9f0;border-radius:8px;padding:16px;margin-top:16px;font-size:13px;color:#444">
      <strong>Bilan de la veille</strong><br>
      ✅ ${imported.length} article${imported.length !== 1 ? 's' : ''} importé${imported.length !== 1 ? 's' : ''}
      · ⏭ ${stats.skipped} ignorés
      · 🌍 ${stats.skipped_regional} non-nationaux
      · 🤖 ${stats.gpt_errors} erreurs GPT
      · 📡 ${stats.feed_stats.length} flux testés<br><br>
      <strong>Flux par flux :</strong><br>
      ${stats.feed_stats.map(f => `• ${f.nom} : ${f.status} - ${f.items} articles récupérés${f.error ? ' - ⚠ ' + f.error : ''}`).join('<br>')}
    </div>`;

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;margin:0;padding:0">
<div style="max-width:680px;margin:0 auto">
  <div style="background:linear-gradient(135deg,#1a5c3e,#27956a,#38a8b5);padding:32px 40px;text-align:center">
    <span style="color:#fff;font-size:22px;font-weight:700">Veille du matin</span><br>
    <span style="color:rgba(255,255,255,.8);font-size:14px">${dateStr}</span>
  </div>
  <div style="padding:24px 32px;background:#f8fafc">
    ${imported.length > 0 ? `
    <p style="color:#333;margin:0 0 16px">${imported.length} article${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} automatiquement.
      <a href="${siteUrl}/mockup/admin.html" style="color:#2a6db8">Espace admin → Veille</a> pour rejeter les non pertinents.</p>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e8edf2">
      ${articleRows}
    </table>` : `<p style="color:#666;margin:0 0 16px">Aucun article importé aujourd'hui.</p>`}
    ${statsSection}
    ${errorSection}
  </div>
</div></body></html>`;

  const subject = imported.length > 0
    ? `[Veille] ${imported.length} article${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} - ${new Date().toLocaleDateString('fr-FR')}`
    : `[Veille] Aucun article importé - ${new Date().toLocaleDateString('fr-FR')}`;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender:      { name: process.env.SENDER_NAME || 'Générations Médecins', email: process.env.SENDER_EMAIL },
      to:          [{ email: process.env.ADMIN_EMAIL }],
      subject,
      htmlContent: html,
    }),
  }).catch(e => console.error('Brevo error:', e.message));
}

// ── Auth helper ──────────────────────────────────────────────────────────────

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

// ── Core logic ───────────────────────────────────────────────────────────────

async function runVeille() {
  const results = {
    imported: [],
    skipped: 0,
    skipped_regional: 0,
    gpt_errors: 0,
    errors: [],
    feed_stats: [],
  };
  const today = new Date().toISOString().slice(0, 10);

  for (const feed of RSS_FEEDS) {
    const feedStat = { nom: feed.nom, url: feed.url, status: '', items: 0, error: '' };
    let xml;
    try {
      const r = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; GenerationsMedecins-Veille/2.0; +https://generations-medecins.fr)',
          'Accept':     'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(15000),
      });
      feedStat.status = `HTTP ${r.status}`;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      xml = await r.text();
    } catch (e) {
      feedStat.error = e.message;
      results.errors.push(`${feed.nom}: ${e.message}`);
      results.feed_stats.push(feedStat);
      continue;
    }

    const items = parseXml(xml).filter(i => isRecent(i.pubDate));
    feedStat.items = items.length;
    results.feed_stats.push(feedStat);

    console.log(`Feed ${feed.nom}: ${items.length} items récents`);

    for (const item of items.slice(0, 8)) {
      if (!item.link || !item.title) { results.skipped++; continue; }
      if (await urlAlreadyExists(item.link)) { results.skipped++; continue; }

      // Si OpenAI non configuré, on importe sans classification
      if (!process.env.OPENAI_API_KEY) {
        console.warn('OPENAI_API_KEY non configuré - import sans classification GPT');
        const rawTitle = item.title.replace(/<[^>]+>/g, '').trim();
        const dashIdx  = rawTitle.lastIndexOf(' - ');
        const titre    = (dashIdx > 30 ? rawTitle.slice(0, dashIdx) : rawTitle).slice(0, 250);
        const source   = feed.nom;
        const slug     = slugify(titre) + '-' + Date.now().toString(36);
        const row = {
          titre, slug, url: item.link, source,
          publie_le: item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : today,
          resume: (item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
          contenu: (item.content || item.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          auteur: null, categorie: 'avenant', acces: 'public',
          publie: true, auto_import: true, veille_statut: 'publie', tags: [],
        };
        const inserted = await insertDecrypteur(row);
        if (inserted) results.imported.push({ titre, source, publie_le: row.publie_le, resume: row.resume, tags: [] });
        else results.errors.push(`Insert failed: ${titre.slice(0, 60)}`);
        continue;
      }

      const classification = await classifyArticle({ ...item, nom: feed.nom });

      if (classification === null) {
        results.gpt_errors++;
        results.skipped++;
        continue;
      }

      if (!classification.pertinent) {
        results.skipped_regional++;
        results.skipped++;
        continue;
      }

      const rawTitle  = stripHtmlEntities(item.title.replace(/<[\s\S]*?>/g, ' '));
      const dashIdx   = rawTitle.lastIndexOf(' - ');
      const titre     = (dashIdx > 30 ? rawTitle.slice(0, dashIdx) : rawTitle).slice(0, 250);
      const publisher = dashIdx > 30 ? rawTitle.slice(dashIdx + 3).trim() : '';
      const source    = feed.nom === 'Google News' ? (publisher || 'Google News') : feed.nom;
      const slug      = slugify(titre) + '-' + Date.now().toString(36);
      const resume    = classification.resume || '';

      const row = {
        titre,
        slug,
        url:           item.link,
        source,
        publie_le:     item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : today,
        resume,
        contenu:       resume, // on n'expose pas le HTML brut du RSS
        auteur:        null,
        categorie:     'avenant',
        acces:         'public',
        publie:        true,
        auto_import:   true,
        veille_statut: 'publie',
        tags:          classification.tags || [],
      };

      const inserted = await insertDecrypteur(row);
      if (inserted) {
        results.imported.push({ titre, source, publie_le: row.publie_le, resume: row.resume, tags: row.tags });
      } else {
        results.errors.push(`Insert failed: ${titre.slice(0, 60)}`);
      }
    }
  }

  // Toujours envoyer l'email de synthèse (même à 0 articles, pour diagnostiquer)
  await sendAdminDigest(results.imported, results);

  console.log(`Veille : ${results.imported.length} importés, ${results.skipped} ignorés (${results.skipped_regional} régionaux, ${results.gpt_errors} GPT errors), ${results.errors.length} erreurs feed`);
  if (results.errors.length) console.error('Erreurs:', results.errors.join('\n'));

  return results;
}

// ── Main handler ─────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const cronKey = event.headers['x-cron-key'] || event.headers['X-Cron-Key'];
  const isCron  = cronKey && cronKey === process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isCron) {
    const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
    const user  = await verifySuperAdmin(token);
    if (!user) {
      console.warn('Veille : invocation non autorisée refusée');
      return { statusCode: 403 };
    }
  }

  const results = await runVeille();
  return { statusCode: 200, body: JSON.stringify(results) };
};
