import type { Book, Slide } from '../../lib/types'
import { defaultBook } from '../defaultBook'

// ---------------------------------------------------------------------------
// DGOS variant — the book shown to a public-policy audience.
// - Cover reframed (no commercial pitch)
// - Benefits fully rewritten around policy/insights value, not conversion
// - Events + BigEvent merged into a single "eventsAll" slide
// - Testimonials, Packs and Budget-focused parts trimmed
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
            'Une base de 3 000+ médecins mobilisable en quelques jours pour vos études, panels d’experts et baromètres.',
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

// Removes DGOS from the partners logos grid and disables the spotlight
// slot (highlightName='' short-circuits the registry's ctx.partnerName
// fallback so no card is highlighted).
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

// Summary rewritten to reflect the new chapter ranges after the DGOS trim.
function overrideSummary(slide: Slide): Slide {
  if (slide.type !== 'summary') return slide
  return {
    type: 'summary',
    props: {
      title: 'Sommaire',
      items: [
        { chapter: '01', title: 'Qui sommes-nous ?', description: 'Audience, manifesto, bureau, médias', range: 'Slides 03 – 06' },
        { chapter: '02', title: "Ce que nous vous apportons", description: "Bénéfices, audience, leviers d'activation", range: 'Slides 07 – 09' },
        { chapter: '03', title: 'Nos rendez-vous & plateforme', description: 'Events, Big Event, outils membres', range: 'Slides 10 – 12' },
        { chapter: '04', title: 'Communauté & investissement', description: 'Partenaires actuels, budget', range: 'Slides 13 – 14' },
        { chapter: '05', title: 'Engagement & contact', description: 'Charte et points de contact', range: 'Slides 15 – 16' },
      ],
    },
  }
}

export const dgosBook: Book = (() => {
  const transformed: Slide[] = []

  for (const slide of defaultBook.slides) {
    // Slides that are dropped entirely for the DGOS book
    if (slide.type === 'testimonials') continue
    if (slide.type === 'packs') continue
    // 'bigEvent' is merged into the eventsAll slide we emit in place of 'events'
    if (slide.type === 'bigEvent') continue

    let s: Slide = slide
    s = overrideCover(s)
    s = overrideSummary(s)
    s = overrideBenefits(s)
    s = mergeEventsAndBigEvent(s)
    s = stripDgosFromPartners(s)
    s = overrideContact(s)

    transformed.push(s)
  }

  return {
    ...defaultBook,
    slides: transformed,
  }
})()
