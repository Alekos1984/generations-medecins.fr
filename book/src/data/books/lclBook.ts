import type { Book, Slide } from '../../lib/types'
import { defaultBook } from '../defaultBook'

// ---------------------------------------------------------------------------
// LCL variant — pitch commercial soft pour une banque.
// On garde les arguments commerciaux (décisions financières, installation,
// prêt, assurance) parce que c'est pertinent pour une banque. Mais on
// RETIRE les slides Packs et Budget : objectif = "voici qui on est, voici
// pourquoi on a besoin de partenaires", pas "donnez X euros".
// La slide finale est un appel à partenariat institutionnel, pas une offre.
// ---------------------------------------------------------------------------

function stripLclFromPartners(slide: Slide): Slide {
  if (slide.type !== 'partnersLogos') return slide
  return {
    type: 'partnersLogos',
    props: {
      ...slide.props,
      partners: slide.props.partners.filter((p) => p.name.trim().toLowerCase() !== 'lcl'),
    },
  }
}

function overrideCover(slide: Slide): Slide {
  if (slide.type !== 'cover') return slide
  return {
    type: 'cover',
    props: {
      ...slide.props,
      titleLines: ['Devenez', "l'allié bancaire", "d'une nouvelle", 'génération de médecins'],
      subtitle:
        'Un réseau de plus de 3 000 médecins jeunes et en pleine phase de décisions financières.\nUne opportunité de les accompagner — nous cherchons des partenaires qui portent notre vision.',
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
      body:
        'Nous cherchons des partenaires qui partagent notre vision : accompagner les médecins au moment où ils en ont le plus besoin, dans un cadre de confiance et de transparence.',
    },
  }
}

// Appel à partenariat : une slide dédiée à la place du Packs/Budget retirés.
// Pas de chiffre, pas de pack : juste "voici pourquoi un partenariat avec LCL
// a du sens, et ce qu'on propose comme cadre général".
const partnershipCallSlide: Slide = {
  type: 'benefits',
  props: {
    eyebrow: '05 • Pourquoi un partenariat LCL × GM',
    title: 'Un alignement naturel',
    subtitle:
      "Nos adhérents sont dans le moment précis où ils choisissent leur banque. Vous êtes la banque de référence pour l'exercice libéral. Nous cherchons un partenaire qui porte notre vision — pas un sponsor.",
    benefits: [
      {
        num: '01',
        title: 'La banque de confiance au moment des grandes décisions',
        body:
          "Installation en libéral, achat du cabinet, acquisition immobilière, montage de société, prévoyance, prêt préférentiel. LCL coche toutes les cases que nos adhérents cochent dans les 18 mois qui suivent leur DES.",
        arrow: 'Un marché captif qui se décide une fois pour toute la carrière.',
      },
      {
        num: '02',
        title: "Un pont court entre LCL et nos canaux",
        body:
          "Newsletter mensuelle, events présentiels mensuels, Big Event annuel, plateforme membre. Nous relayons ce qui compte pour nos adhérents — y compris les offres bancaires lorsqu'elles correspondent à de vrais besoins.",
        arrow: 'Pas de publicité intrusive — de la recommandation en contexte.',
      },
      {
        num: '03',
        title: "Co-construction, pas sponsoring",
        body:
          "Nous proposons des contenus co-brandés qui apportent de la valeur aux médecins : fiches « monter son cabinet », webinaires « optimiser son emprunt », baromètres financiers.",
        arrow: 'Votre marque associée à des contenus utiles, pas à des encarts publicitaires.',
      },
      {
        num: '04',
        title: 'Une vision partagée',
        body:
          "La médecine libérale change profondément. Nous accompagnons cette transformation. Nous cherchons un partenaire bancaire qui souhaite y jouer un rôle, pas seulement y vendre un produit.",
        arrow: 'Un partenariat pluriannuel, co-construit, mesuré.',
      },
    ],
    closing:
      "Nous proposons de co-construire le cadre, les actions et les objectifs — ensemble. Ce document est un point de départ, pas une offre finale.",
  },
}

export const lclBook: Book = (() => {
  const transformed: Slide[] = []

  for (const slide of defaultBook.slides) {
    // Drop the two slides the user asked to remove — no packages, no budget
    if (slide.type === 'packs') continue
    if (slide.type === 'budget') continue

    let s: Slide = slide
    s = overrideCover(s)
    s = stripLclFromPartners(s)
    s = overrideContact(s)

    transformed.push(s)

    // Insert the partnership call right after the plateforme Features slide.
    // That places it in the final third of the deck, after we've shown what
    // GM is and before the closing.
    if (slide.type === 'features') {
      transformed.push(partnershipCallSlide)
    }
  }

  return {
    ...defaultBook,
    title: 'GM × LCL • Vers un partenariat',
    slides: transformed,
  }
})()
