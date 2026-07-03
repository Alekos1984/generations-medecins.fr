/**
 * Netlify Background Function — Génération de la newsletter bimensuelle (≤ 15 min)
 *
 * Déclenchée :
 *   • automatiquement le 1er et le 15 du mois par newsletter-cron.js
 *   • manuellement depuis l'admin (bouton « Générer la newsletter »)
 *
 * Pipeline :
 *   1. Récupère les articles décrypteurs publiés des 15 derniers jours
 *   2. gpt-4o-mini sélectionne les 5 plus importants (pas cher, tâche simple)
 *   3. gpt-4o rédige la newsletter au vitriol (2 fois/mois, on paie le style)
 *   4. Insère en statut='pending' dans newsletters_auto → validation admin
 *
 * Env vars requis : OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
 *                   SUPABASE_SERVICE_ROLE_KEY
 */

const SB = () => process.env.SUPABASE_URL;
const SRK = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = () => ({
  Authorization: `Bearer ${SRK()}`,
  apikey: SRK(),
  'Content-Type': 'application/json',
});

async function verifySuperAdmin(token) {
  if (!token) return null;
  const userRes = await fetch(`${SB()}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  if (!user?.id) return null;
  const adminRes = await fetch(
    `${SB()}/rest/v1/admins?select=role&user_id=eq.${user.id}`,
    { headers: sbHeaders() }
  );
  const admins = await adminRes.json();
  return admins?.[0]?.role === 'super_admin' ? user : null;
}

// ── OpenAI helper ────────────────────────────────────────────────────────────

async function chatJson(model, messages, { temperature = 0.7, maxTokens = 4000 } = {}) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI ${model} HTTP ${res.status} : ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenAI ${model} : réponse vide`);
  return JSON.parse(content);
}

// ── Étape 1 : sélection des 5 articles ──────────────────────────────────────

async function selectionnerArticles(articles) {
  const liste = articles.map(a => ({
    id: a.id,
    titre: a.titre,
    extrait: (a.extrait || (a.contenu || '').replace(/[#*_>\[\]]/g, ' ')).slice(0, 350),
    source: a.source || null,
    date: (a.created_at || '').slice(0, 10),
    categorie: a.categorie || null,
    tags: a.tags || [],
  }));

  const prompt = `Tu es le rédacteur en chef de la newsletter du syndicat Générations Médecins Île-de-France (médecins libéraux, ton combatif).

Voici les ${liste.length} articles de veille des 15 derniers jours :

${JSON.stringify(liste, null, 1)}

Sélectionne les 5 articles LES PLUS IMPORTANTS pour des médecins libéraux, selon ces critères :
- Impact concret sur l'exercice, les revenus, les conditions de travail des médecins libéraux
- Actualité chaude qui suscite colère, inquiétude ou mobilisation
- Matière à un commentaire mordant et engagé
- Diversité des sujets (évite 5 articles sur le même thème)

Réponds en JSON strict :
{"selection": [{"id": "uuid de l'article", "raison": "une phrase expliquant pourquoi cet article est retenu"}]}

Exactement 5 éléments (ou moins s'il y a moins de 5 articles fournis). Les id doivent être copiés exactement.`;

  const out = await chatJson('gpt-4o-mini', [{ role: 'user', content: prompt }], { temperature: 0.3, maxTokens: 1200 });
  const sel = Array.isArray(out.selection) ? out.selection : [];
  // Ne garde que les ids réellement présents
  const byId = Object.fromEntries(articles.map(a => [a.id, a]));
  return sel.filter(s => byId[s.id]).slice(0, 5).map(s => ({ ...byId[s.id], raison: s.raison }));
}

// ── Étape 2 : rédaction au vitriol ──────────────────────────────────────────

async function redigerNewsletter(selection, periodeDebut, periodeFin) {
  const dossier = selection.map((a, i) => `ARTICLE ${i + 1} — ${a.titre}
Source : ${a.source || 'veille'} ${a.url ? `(${a.url})` : ''}
Date : ${(a.created_at || '').slice(0, 10)}
Pourquoi retenu : ${a.raison}
Contenu :
${(a.contenu || a.extrait || '').slice(0, 3500)}`).join('\n\n————————————————\n\n');

  const system = `Tu écris la newsletter bimensuelle du syndicat Générations Médecins Île-de-France, destinée à des médecins libéraux adhérents.

LE TON — équilibre exigeant :
- Engagé, lucide, mordant quand c'est justifié, jamais complaisant, mais fondamentalement CONSTRUCTIF. On ne vanne pas les tutelles par réflexe : on prend leurs annonces au sérieux, on montre précisément en quoi elles pèchent ou en quoi elles vont dans le bon sens, et on propose systématiquement une piste alternative, un amendement, une amélioration ou un chemin de co-construction. Le syndicat est une force de proposition avant d'être une force d'opposition.
- L'ironie et le trait piquant restent bienvenus pour souligner l'absurde d'une situation, mais toujours au service de l'analyse, jamais gratuits. Le lecteur doit ressortir de la newsletter en comprenant mieux le dossier ET en sentant qu'une voie de sortie existe, qu'il y a matière à discuter avec les partenaires institutionnels.
- Registre humain : on parle à des confrères qui exercent quotidiennement, pas à des militants professionnels. On respecte leur intelligence et leur temps.

LA STRUCTURE — impérative pour CHAQUE article traité :
- Pars du principe que le lecteur N'A ABSOLUMENT PAS lu l'article. Il faut donc systématiquement commencer par un RAPPEL FACTUEL détaillé (au moins un paragraphe substantiel : qui a annoncé quoi, quand, à quel niveau institutionnel, avec les chiffres, dates, montants, dispositifs précis tirés du contenu de l'article). Ne suppose rien de connu.
- Puis un paragraphe d'ANALYSE ET DE MISE EN PERSPECTIVE : que signifie concrètement cette information pour un médecin libéral qui installe son cabinet lundi matin, quelles sont les implications sur les revenus, l'organisation, la relation avec les patients, l'attractivité de l'exercice.
- Puis un paragraphe de POSITION DU SYNDICAT ASSORTIE D'UNE PROPOSITION : ce qu'on soutient ou ce qu'on regrette, en précisant à chaque fois une alternative concrète, un amendement, une contre-proposition ou une piste de dialogue. Même si c'est modeste, il faut toujours qu'un lecteur reparte avec l'idée que le syndicat propose quelque chose et pas seulement qu'il proteste.

LA FORME — règles strictes :
- Des phrases longues, amples, articulées, qui déroulent l'argument, la nuance et la proposition dans le même mouvement rédactionnel. INTERDIT : les phrases courtes façon slogan qui claquent en trois mots. INTERDIT : les tirets typographiques (— ou –) qu'on trouve dans les articles de presse en ligne. INTERDIT : les listes à puces et les énumérations verticales. Tu écris de vrais paragraphes de billet rédigé en continu, comme un éditorial de fond.
- Longueur totale : entre 900 et 1400 mots. Prends le temps de développer chaque section, la substance prime sur la concision.
- CHAQUE section commence par un intertitre percutant sur sa propre ligne, écrit en gras Markdown avec le format \`**Intertitre en une phrase intrigante**\`. L'intertitre pose la question ou l'enjeu, sans dévoiler la conclusion. Il n'est pas en majuscules.
- À l'intérieur d'un bloc, tu peux mettre en gras Markdown (\`**mot ou expression**\`) les 2 ou 3 termes vraiment importants de la section (un chiffre-clé, une date-charnière, un dispositif nommé). Utilise cette emphase avec parcimonie pour qu'elle garde son poids.
- Structure globale : une accroche d'ouverture (3-4 phrases) qui donne le ton constructif et engagé, puis exactement UN BLOC PAR ARTICLE RETENU (5 blocs, chacun avec sa triple structure rappel/analyse/proposition), puis un dernier BLOC DE CONCLUSION mobilisatrice qui rappelle les combats en cours, les rendez-vous à venir et invite à rejoindre ou soutenir le mouvement.

SORTIE — JSON strict :
{
  "objet": "objet de l'email, accrocheur mais pas racoleur, max 80 caractères",
  "accroche": "3-4 phrases d'ouverture qui donnent le ton constructif et engagé de toute la newsletter, sans être un simple résumé sec",
  "blocs": [
    {"type": "text", "text": "**Intertitre percutant en une phrase**\\n\\nRappel factuel détaillé…\\n\\nAnalyse et mise en perspective…\\n\\nPosition du syndicat et proposition concrète…"},
    … exactement un bloc par article retenu (5 blocs au total pour les articles), puis un dernier bloc pour la conclusion mobilisatrice
  ],
  "cta_text": "texte court du bouton d'appel à l'action",
  "cta_url": "https://generations-medecins.fr/adherer.html"
}`;

  const user = `Période couverte : du ${periodeDebut} au ${periodeFin}.

Voici les 5 articles sélectionnés, avec leur contenu :

${dossier}

Rédige la newsletter maintenant. JSON strict uniquement.`;

  return chatJson('gpt-4o', [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { temperature: 0.9, maxTokens: 4000 });
}

// ── Pipeline principal ───────────────────────────────────────────────────────

async function genererNewsletter() {
  const logLines = [];
  const log = (m) => { console.log(m); logLines.push(m); };

  const fin = new Date();
  const debut = new Date(Date.now() - 15 * 24 * 3600 * 1000);
  const periodeDebut = debut.toISOString().slice(0, 10);
  const periodeFin = fin.toISOString().slice(0, 10);

  log(`Newsletter auto — période ${periodeDebut} → ${periodeFin}`);

  // 1. Articles des 15 derniers jours (publiés, veille non rejetée)
  const q = `${SB()}/rest/v1/decrypteurs` +
    `?select=id,titre,extrait,contenu,source,url,categorie,tags,created_at` +
    `&publie=eq.true&veille_statut=neq.rejete` +
    `&created_at=gte.${debut.toISOString()}` +
    `&order=created_at.desc&limit=60`;
  const artRes = await fetch(q, { headers: sbHeaders() });
  const articles = await artRes.json();
  if (!Array.isArray(articles)) throw new Error(`Lecture décrypteurs : ${JSON.stringify(articles).slice(0, 200)}`);
  log(`${articles.length} article(s) publiés sur la période`);

  if (articles.length < 2) {
    throw new Error(`Seulement ${articles.length} article(s) sur 15 jours — pas assez de matière pour une newsletter.`);
  }

  // 2. Sélection des 5 plus importants
  const selection = await selectionnerArticles(articles);
  log(`Sélection : ${selection.map(a => a.titre).join(' | ')}`);
  if (!selection.length) throw new Error('La sélection gpt-4o-mini est vide.');

  // 3. Rédaction au vitriol
  const nl = await redigerNewsletter(selection, periodeDebut, periodeFin);
  if (!nl.objet || !Array.isArray(nl.blocs) || !nl.blocs.length) {
    throw new Error(`Rédaction gpt-4o incomplète : ${JSON.stringify(nl).slice(0, 300)}`);
  }
  log(`Rédigé : "${nl.objet}" — ${nl.blocs.length} bloc(s)`);

  // 4. Insertion en pending
  const insert = {
    objet: String(nl.objet).slice(0, 200),
    accroche: nl.accroche || null,
    blocs: nl.blocs.filter(b => b && b.type === 'text' && b.text),
    cta_text: nl.cta_text || 'Rejoindre le mouvement →',
    cta_url: nl.cta_url || 'https://generations-medecins.fr/adherer.html',
    articles: selection.map(a => ({
      id: a.id, titre: a.titre, url: a.url || null, source: a.source || null, raison: a.raison,
    })),
    periode_debut: periodeDebut,
    periode_fin: periodeFin,
    modele: 'gpt-4o',
    statut: 'pending',
    log: logLines.join('\n').slice(0, 8000),
  };
  const insRes = await fetch(`${SB()}/rest/v1/newsletters_auto`, {
    method: 'POST',
    headers: { ...sbHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify(insert),
  });
  if (!insRes.ok) throw new Error(`Insertion newsletters_auto : HTTP ${insRes.status} ${(await insRes.text()).slice(0, 200)}`);
  const row = (await insRes.json())[0];
  log(`✓ Newsletter ${row.id} en attente de validation`);
  return { ok: true, id: row.id, objet: insert.objet };
}

// ── Handler ──────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const cronKey = event.headers['x-cron-key'] || event.headers['X-Cron-Key'];
  const isCron = cronKey && cronKey === SRK();

  if (!isCron) {
    const token = (event.headers.authorization || '').replace('Bearer ', '').trim();
    const user = await verifySuperAdmin(token);
    if (!user) {
      console.warn('Newsletter auto : invocation non autorisée refusée');
      return { statusCode: 403 };
    }
  }

  try {
    const result = await genererNewsletter();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    console.error('Newsletter auto — échec :', e.message);
    // Trace l'échec en base pour que l'admin le voie
    await fetch(`${SB()}/rest/v1/newsletters_auto`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({
        objet: '⚠ Échec de génération',
        statut: 'rejected',
        erreur: e.message.slice(0, 1000),
        periode_debut: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        periode_fin: new Date().toISOString().slice(0, 10),
      }),
    }).catch(() => {});
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
