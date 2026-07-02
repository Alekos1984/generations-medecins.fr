import type { Book, Slide } from '../../lib/types'
import { defaultBook } from '../defaultBook'

// ---------------------------------------------------------------------------
// DGOS variant — the book shown to a public-policy audience.
// - Cover reframed (no commercial pitch)
// - Stats: quote removed
// - Benefits fully rewritten around policy/insights value, not conversion
// - New slides inserted after the "opportunity" block:
//     * Bilatérales CNAM (pillars)
//     * 27 M RDV non honorés (benefits reworked)
//     * Groupes de travail (workingGroups)
// - Events + BigEvent merged into a single "eventsAll" slide
// - New slide after the plateforme: Médecins En Grève (features)
// - Testimonials, Packs slides trimmed
// - PartnersLogos: DGOS is removed from the logos grid and no spotlight
// - Contact: shortened wording
// ---------------------------------------------------------------------------

function overrideCover(slide: Slide): Slide {
  if (slide.type !== 'cover') return slide
  return {
    type: 'cover',
    props: {
      ...slide.props,
      titleLines: ['Un pont', 'entre le ministère', 'et les médecins', 'de terrain'],
      subtitle:
        "Un réseau de plus de 3 000 médecins jeunes et engagés.\nUne base qualifiée, mobilisable pour vos études et vos politiques publiques.",
    },
  }
}

function overrideStats(slide: Slide): Slide {
  if (slide.type !== 'stats') return slide
  return {
    type: 'stats',
    props: {
      ...slide.props,
      // Commercial quote does not resonate with a DGOS audience — drop it.
      quote: undefined,
    },
  }
}

function overrideBenefits(slide: Slide): Slide {
  if (slide.type !== 'benefits') return slide
  return {
    type: 'benefits',
    props: {
      eyebrow: "02 • L'opportunité",
      title: 'Ce que nous pouvons apporter à la DGOS',
      subtitle: 'Quatre leviers concrets pour renforcer votre action auprès des médecins.',
      benefits: [
        {
          num: '01',
          title: 'Enquêtes qualifiées et baromètres',
          body:
            'Une base de 3 000+ médecins mobilisable en quelques jours pour vos études, panels d\'experts et baromètres.',
          items: [
            'Sondages thématiques',
            'Baromètres de satisfaction',
            "Panels d'experts",
            'Focus groups qualitatifs',
          ],
          arrow: 'Des insights terrain fiables pour éclairer vos décisions politiques.',
        },
        {
          num: '02',
          title: 'Diffuser vos politiques publiques avec impact',
          body:
            "Nos canaux touchent les médecins que les campagnes gouvernementales classiques peinent à atteindre.",
          items: [
            "Aide à l'installation en zones sous-dotées",
            'Adhésion aux CPTS et ESS',
            'Nouveaux dispositifs réglementaires',
            'Parcours de formation continue',
          ],
          arrow:
            "Meilleur taux de lecture qu'une communication institutionnelle traditionnelle.",
        },
        {
          num: '03',
          title: 'Un vivier de médecins engagés',
          body:
            "Nos adhérents sont jeunes, motivés, prêts à s'engager sur les sujets structurants.",
          items: [
            'Groupes de travail',
            'Consultations publiques',
            'Ambassadeurs de terrain',
            'Testeurs de nouveaux dispositifs',
          ],
          arrow: "Un réseau prêt à contribuer, pas juste à être informé.",
        },
        {
          num: '04',
          title: 'Un pont opérationnel avec le terrain',
          body:
            "Boucle de retour rapide entre la DGOS et le quotidien des médecins en cabinet ou à l'hôpital.",
          items: [
            'Alertes anticipées sur les tensions',
            'Retours qualitatifs sur les réformes',
            'Cartographie régionale des enjeux',
            'Accès direct aux KOL du bureau',
          ],
          arrow:
            "Ne pas piloter à l'aveugle : voir ce qui se passe vraiment dans les cabinets et les services.",
        },
      ],
      closing:
        "Nous ne sommes pas un lobby. Nous sommes une communauté de médecins jeunes et engagés, prête à travailler main dans la main avec la DGOS pour bâtir une politique de santé au plus près du terrain.",
    },
  }
}

// New DGOS-specific slides -------------------------------------------------

const bilateralesSlide: Slide = {
  type: 'pillars',
  props: {
    eyebrow: '02 • Un interlocuteur privilégié',
    title: 'Présence aux bilatérales CNAM',
    subtitle:
      'Anticiper les prochaines réformes plutôt que de les subir. Un canal court avec la CNAM et la DGOS.',
    pillars: [
      {
        num: '01',
        title: 'Interlocuteur récurrent',
        body:
          'Présence régulière aux bilatérales CNAM. Remontées et propositions en amont des cycles conventionnels, pas seulement en réaction.',
        tags: ['Bilatérales', 'Amont cyclique'],
      },
      {
        num: '02',
        title: 'Voix des jeunes générations',
        body:
          'Cible des prochaines réformes conventionnelles. Là où les autres syndicats représentent surtout les installés, nous portons la voix de celles et ceux qui vont installer leur cabinet dans les 10 ans.',
        tags: ['90% < 10 ans DES', '15% internes'],
      },
      {
        num: '03',
        title: 'Multi-activité',
        body:
          "Hospitaliers déjà en commission, chefs de service, libéraux, mixtes. Aucun autre syndicat ne couvre autant de terrains d'exercice à la fois.",
        tags: ['Hôpital & Ville', 'Chefs de service', 'Toutes spécialités'],
      },
    ],
  },
}

const lapinsSlide: Slide = {
  type: 'benefits',
  props: {
    eyebrow: '02 • Un chantier prioritaire',
    title: '27 millions de RDV non honorés',
    subtitle:
      "Un problème que personne ne veut prendre à bras-le-corps. Nous portons une proposition, prête à être défendue politiquement.",
    benefits: [
      {
        num: '27M',
        title: 'Le coût invisible des lapins',
        body:
          "Chaque année, 27 millions de rendez-vous non honorés. Un cabinet médical sur cinq subit plusieurs lapins par semaine — perte sèche, désorganisation, tension avec les patients qui, eux, attendent des mois pour un créneau.",
        items: [
          'Perte financière directe',
          'Créneaux gaspillés dans les zones sous-dotées',
          'Rallongement des délais pour les vrais patients',
          'Épuisement des équipes',
        ],
        arrow: "Un sujet transversal ville + hôpital, sans solution consensuelle à ce jour.",
      },
      {
        num: '✚',
        title: 'Notre proposition, prête à être portée',
        body:
          "Un dispositif équilibré, testé sur notre base, qui responsabilise sans stigmatiser. Détail technique et modalités disponibles sur demande.",
        items: [
          'Cadre juridique clair',
          "Barème progressif adapté à l'ambulatoire",
          "Cas d'exemption (précarité, urgence sociale)",
          "Applicable rapidement, sans réforme lourde",
        ],
        arrow:
          "Un dossier concret, opérationnel, qui donne à la DGOS le soutien massif des médecins à quelques mois des prochaines élections professionnelles.",
      },
    ],
    closing:
      "Une victoire rapide, populaire chez les médecins, économiquement justifiée. Le genre de mesure qui laisse une trace positive après un passage au ministère.",
  },
}

const workingGroupsSlide: Slide = {
  type: 'workingGroups',
  props: {
    eyebrow: '02 • Notre force organisationnelle',
    title: 'Nos groupes de travail thématiques',
    subtitle:
      "Un référent par groupe, déjà en place. Des propositions au gouvernement plutôt que des passages en force.",
    groups: [
      {
        name: "Installation & Exercice mixte",
        theme: 'Ville / Hôpital',
        lead: 'Dr. Pierre HAMANN',
        leadRole: 'Vice-président — Dermatologue, Chef de Service',
      },
      {
        name: 'Convention CNAM & Tarifications',
        theme: 'Économie de la santé',
        lead: 'Dr. Alexis BOURLA',
        leadRole: 'Président — Psychiatre',
      },
      {
        name: 'Médico-légal & RCP',
        theme: 'Responsabilité',
        lead: 'Dr. Cherifa CHEURFA',
        leadRole: 'Vice-présidente — Anesthésiste-réanimateur',
      },
      {
        name: 'Fiscalité & Gestion du cabinet',
        theme: 'Finances',
        lead: 'Pr. Franck VERDONK',
        leadRole: 'Trésorier — Anesthésiste-réanimateur, Chef de Service',
      },
      {
        name: 'Santé mentale & Épuisement professionnel',
        theme: 'Qualité de vie au travail',
        lead: 'Dr. Soraya HUGAIN',
        leadRole: 'Chargée de mission — Psychiatre hospitalier',
      },
      {
        name: 'Innovation & IA en médecine',
        theme: 'Numérique',
        lead: 'Dr. Rivka BENDRIHEM',
        leadRole: 'Chargée de mission — Radiologue',
      },
    ],
    footnote:
      "Chaque groupe est prêt à être saisi par la DGOS pour co-construire des propositions plutôt que de commenter des textes déjà finalisés.",
  },
}

const mengreveSlide: Slide = {
  type: 'features',
  props: {
    eyebrow: '04 • Notre outil de mesure',
    title: 'La plateforme « Médecins En Grève »',
    subtitle:
      'Notre canal de remontée le plus rapide. Plus court, plus qualitatif et plus fiable que les autres syndicats.',
    features: [
      {
        glyph: '📊',
        tag: 'Baromètre en temps réel',
        title: 'Médecins En Grève',
        body:
          "Une plateforme mise en place lors des mouvements de 2024. Aujourd'hui, elle sert de baromètre permanent pour prendre le pouls du terrain : mesure de l'adhésion à une proposition, alerte sur une tension émergente, sondage flash sur un texte en préparation. Les remontées arrivent en 24 à 72 h, là où les canaux syndicaux classiques prennent des semaines.",
        tools: [
          { name: '12 000 contacts actifs' },
          { name: 'Résultats en 24-72 h' },
        ],
      },
    ],
  },
}

// Removes DGOS from the partners logos grid and disables the spotlight slot.
function stripDgosFromPartners(slide: Slide): Slide {
  if (slide.type !== 'partnersLogos') return slide
  return {
    type: 'partnersLogos',
    props: {
      ...slide.props,
      subtitle: 'Ils nous accompagnent déjà dans nos actions.',
      highlightName: '',
      partners: slide.props.partners.filter((p) => p.name.trim().toLowerCase() !== 'dgos'),
    },
  }
}

// Replaces the 'events' slide with an eventsAll variant that fuses monthly
// events + the big event annuel on a single page.
function mergeEventsAndBigEvent(slide: Slide): Slide {
  if (slide.type !== 'events') return slide
  return {
    type: 'eventsAll',
    props: {
      eyebrow: '03 • Nos rendez-vous',
      title: 'Un dispositif événementiel double',
      subtitle:
        '10 rencontres mensuelles pour installer la proximité, plus un grand rendez-vous annuel fédérateur.',
      monthly: {
        kicker: 'Format récurrent',
        heading: 'Events Mensuels',
        facts: [
          { value: '10', label: 'Events / an' },
          { value: '20–35', label: 'Participants' },
          { value: '19h–22h', label: 'Format' },
        ],
        themes: ['Innovation', 'Exercice', 'Entrepreneuriat', 'Médico-légal'],
        footnote: 'Complets à chaque édition, relayés sur nos réseaux sociaux.',
      },
      bigEvent: {
        kicker: 'Rendez-vous phare',
        heading: 'The Big Event',
        facts: [
          { value: '200', label: 'Participants' },
          { value: '½ jour', label: 'Format' },
          { value: '3', label: 'Parcours' },
          { value: '1', label: 'Soirée festive' },
        ],
        tracks: [
          'Assistants, CCA, jeunes libéraux',
          'Hospitaliers (PH, PHU, PU-PH)',
          'Internes (partenariat ISNI)',
        ],
        guest: 'Soirée chez House Clinics',
      },
    },
  }
}

function overrideContact(slide: Slide): Slide {
  if (slide.type !== 'contact') return slide
  return {
    type: 'contact',
    props: {
      ...slide.props,
      title: 'Construisons ensemble un partenariat utile.',
    },
  }
}

// Summary reflects the new ordering after the DGOS additions and trims.
function overrideSummary(slide: Slide): Slide {
  if (slide.type !== 'summary') return slide
  return {
    type: 'summary',
    props: {
      title: 'Sommaire',
      items: [
        { chapter: '01', title: 'Qui sommes-nous ?', description: 'Audience, manifesto, bureau, médias', range: 'Slides 03 – 06' },
        { chapter: '02', title: "Ce que nous vous apportons", description: "Bénéfices, audience, leviers d'activation", range: 'Slides 07 – 09' },
        { chapter: '03', title: 'Un interlocuteur privilégié', description: 'CNAM, chantier lapins, groupes de travail', range: 'Slides 10 – 12' },
        { chapter: '04', title: 'Nos outils & rendez-vous', description: 'Events, plateforme membre, Médecins En Grève', range: 'Slides 13 – 15' },
        { chapter: '05', title: 'Communauté & engagement', description: 'Partenaires actuels, budget, charte, contact', range: 'Slides 16 – 19' },
      ],
    },
  }
}

// -------------------------------------------------------------------------
// Assemble the DGOS book.
// Base = defaultBook, with edits and 4 new slides inserted at specific spots.
// -------------------------------------------------------------------------
export const dgosBook: Book = (() => {
  const transformed: Slide[] = []

  for (const slide of defaultBook.slides) {
    // Slides that are dropped entirely for the DGOS book
    if (slide.type === 'testimonials') continue
    if (slide.type === 'packs') continue
    // bigEvent is merged into the eventsAll slide we emit in place of 'events'
    if (slide.type === 'bigEvent') continue

    let s: Slide = slide
    s = overrideCover(s)
    s = overrideSummary(s)
    s = overrideStats(s)
    s = overrideBenefits(s)
    s = mergeEventsAndBigEvent(s)
    s = stripDgosFromPartners(s)
    s = overrideContact(s)

    transformed.push(s)

    // Insert the 3 policy slides just after 'pillars' (chapter 02 close).
    if (slide.type === 'pillars') {
      transformed.push(bilateralesSlide, lapinsSlide, workingGroupsSlide)
    }

    // Insert Médecins En Grève right after the plateforme features slide.
    if (slide.type === 'features') {
      transformed.push(mengreveSlide)
    }
  }

  return {
    ...defaultBook,
    slides: transformed,
  }
})()
