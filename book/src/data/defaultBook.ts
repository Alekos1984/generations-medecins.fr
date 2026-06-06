import type { Book } from '../lib/types'

const partnerLogoBySlug = (slug: string) => `/logos/${slug}`

const knownPartners = [
  { name: 'Crédit Agricole', logo: partnerLogoBySlug('CA.png') },
  { name: 'La Médicale', logo: partnerLogoBySlug('LM.png') },
  { name: 'One Gestion Privée', logo: partnerLogoBySlug('OGP.png') },
  { name: 'Hack Your Care', logo: partnerLogoBySlug('HYC.png') },
  { name: 'NeuroStim', logo: partnerLogoBySlug('NST.png') },
  { name: 'Celene', logo: partnerLogoBySlug('CLN.jpg') },
  { name: 'Amarsi', logo: partnerLogoBySlug('AMA.png') },
  { name: 'Club Privé des Médecins', logo: partnerLogoBySlug('CPM.png') },
  { name: 'Clariane', logo: partnerLogoBySlug('CLA.png') },
  { name: 'Nebimage', logo: partnerLogoBySlug('NEB.png') },
  { name: 'Novo Nordisk', logo: partnerLogoBySlug('NOV.png') },
]

export const defaultBook: Book = {
  title: 'GM IDF • Book Partenaires 2026',
  slides: [
    {
      type: 'cover',
      props: {
        eyebrow: 'PARTENARIAT • 2026',
        brand: 'GÉNÉRATIONS MÉDECINS',
        titleLines: ['Devenez', "l'allié privilégié", "d'une nouvelle", 'génération de médecins'],
        subtitle:
          'Un réseau de plus de 3 000 médecins. Une communauté engagée.\nUn parcours partenaire pensé pour votre impact.',
        footer: 'BOOK PARTENAIRES • ÉDITION 2026',
      },
    },
    {
      type: 'summary',
      props: {
        title: 'Sommaire',
        items: [
          { chapter: '01', title: 'Qui sommes-nous ?', description: 'Audience, manifesto, bureau, médias', range: 'Slides 03 – 06' },
          { chapter: '02', title: "L'opportunité partenaire", description: "Bénéfices, audience, leviers d'activation", range: 'Slides 07 – 09' },
          { chapter: '03', title: 'Nos rendez-vous', description: 'Events mensuels et The Big Event', range: 'Slides 10 – 11' },
          { chapter: '04', title: 'Plateforme & communauté', description: 'Outils, partenaires, témoignages', range: 'Slides 12 – 15' },
          { chapter: '05', title: 'Investissement & engagement', description: 'Besoins, packs, charte, contact', range: 'Slides 16 – 19' },
        ],
      },
    },
    {
      type: 'stats',
      props: {
        eyebrow: 'Notre audience',
        title: 'Une audience importante',
        subtitle: 'Le réseau Générations Médecins en chiffres.',
        stats: [
          { label: 'Adhérents IDF', value: 2000, suffix: '+', caption: 'médecins en Île-de-France' },
          { label: 'Adhérents AURA', value: 1000, suffix: '+', caption: 'Auvergne-Rhône-Alpes' },
          { label: 'Abonnés LinkedIn', value: 17000, caption: 'Président GM — LinkedIn' },
          { label: 'Contacts', value: 12000, caption: 'Base Médecins en Grève' },
          { label: 'Événements / an', value: 10, caption: 'soirées networking qualifiées' },
        ],
        quote:
          "Un partenariat avec GM, c'est un accès direct à un terrain qualifié, une audience engagée et une crédibilité scientifique sans équivalent.",
      },
    },
    {
      type: 'manifesto',
      props: {
        eyebrow: '01 • Qui sommes-nous',
        title: 'Une organisation au service des médecins',
        subtitle: 'Générations Médecins accompagne et défend les médecins.',
        verbs: ['Informer.', 'Fédérer.', 'Accompagner.'],
        body:
          "Nous accompagnons les médecins tout au long de leur carrière, de l'installation aux nouveaux modèles d'exercice. Une communauté active, des contenus utiles et des événements qui rapprochent ville et hôpital.",
        pillars: [
          { num: '1', title: 'Impact & terrain', text: "Services et contenus à forte valeur pour l'installation, l'exercice et la carrière." },
          { num: '2', title: 'Projets structurants', text: 'Plateformes, événements, baromètres pour la communauté médicale.' },
          { num: '3', title: 'Communauté active', text: 'Newsletter, réseaux sociaux, rencontres et networking qualifié.' },
        ],
      },
    },
    {
      type: 'bureau',
      props: {
        eyebrow: '01 • Qui sommes-nous',
        title: 'Le bureau & nos KOLs',
        subtitle: "Un bureau composé de médecins reconnus, leaders d'opinion sur leurs thématiques.",
        members: [
          {
            initials: 'AB',
            name: 'Dr. Alexis BOURLA',
            role: 'Président',
            specialty: 'Psychiatre',
            details: 'Direction médicale — Clariane, NeuroStim, Cline Research, Masterclass Médicale',
            photoUrl: '/bureau/AB.png',
          },
          {
            initials: 'MT',
            name: 'Dr. Minh-Hanh TA',
            role: 'Secrétaire générale',
            specialty: 'Onco-radiothérapeute',
            details:
              'Board médical Résorose & Celene Care • Ancienne vice-présidente nationale de la SFjRO',
            photoUrl: '/bureau/MHT.png',
          },
          {
            initials: 'PH',
            name: 'Dr. Pierre HAMANN',
            role: 'Vice-président',
            specialty: 'Dermatologue',
            details: 'Chef de Service Dermatologie — Kremlin-Bicêtre',
            photoUrl: '/bureau/PH.png',
          },
          {
            initials: 'CC',
            name: 'Dr. Cherifa CHEURFA',
            role: 'Vice-présidente',
            specialty: 'Anesthésiste-réanimateur',
            photoUrl: '/bureau/CC.png',
          },
          {
            initials: 'LK',
            name: 'Dr. Louise-Anne KLEIN',
            role: 'Vice-présidente',
            specialty: 'Gynécologue obstétricienne',
            photoUrl: '/bureau/LAK.png',
          },
          {
            initials: 'FV',
            name: 'Pr. Franck VERDONK',
            role: 'Trésorier',
            specialty: 'Anesthésiste-réanimateur',
            details: 'Chef de Service de Réanimation — Saint-Antoine',
            photoUrl: '/bureau/FV.jpeg',
          },
          {
            initials: 'RB',
            name: 'Dr. Rivka BENDRIHEM',
            role: 'Chargée de mission',
            specialty: 'Radiologue',
            details: "Ancienne présidente de l'UNIR (Union Nationale des Internes en Radiologie)",
            photoUrl: '/bureau/RB.png',
          },
          {
            initials: 'SH',
            name: 'Dr. Soraya HUGAIN',
            role: 'Chargée de mission',
            specialty: 'Psychiatre hospitalier — Sainte-Anne',
            details: 'Représentante à la commission régionale paritaire',
            photoUrl: '/bureau/SH.png',
          },
        ],
        footnote:
          'Plusieurs KOL au sein du bureau • Plusieurs vice-présidents de la FMF ou de syndicats verticaux • Plusieurs chefs de service • Multidisciplinarité forte.',
      },
    },
    {
      type: 'media',
      props: {
        eyebrow: '01 • Présence dans les médias',
        title: 'Une voix qui porte',
        subtitle: 'Plateaux TV et presse médicale — GM est au cœur du débat médical.',
        tiles: [
          {
            kicker: 'Plateau TV',
            name: 'New Deal Santé',
            caption: 'Le show de Martin Blachier',
            image: '/media/new-deal-sante.png',
          },
          {
            kicker: 'Presse médicale',
            name: 'Egora',
            caption: 'Couverture des prises de position du syndicat',
            image: '/media/Egora.png',
          },
        ],
        footnote: 'Des prises de parole régulières qui renforcent la légitimité du réseau auprès des prescripteurs.',
      },
    },
    {
      type: 'benefits',
      props: {
        eyebrow: "02 • L'opportunité",
        title: 'Ce que nous vous apportons',
        subtitle: 'Quatre raisons concrètes de nouer un partenariat pluriannuel avec GM.',
        benefits: [
          {
            num: '01',
            title: 'Toucher les médecins au moment de leurs plus grandes décisions financières',
            body: 'Installation, remplacement, achat immobilier, création de société, prévoyance, retraite, RCP, emprunteur, gestion patrimoniale.',
            arrow:
              'Nos adhérents sont précisément dans la période de vie où ils souscrivent le plus de contrats et changent le plus de prestataires.',
          },
          {
            num: '02',
            title: 'Une audience ultra-ciblée et difficile à toucher autrement',
            body: "Les médecins sont l'une des populations professionnelles les plus difficiles à atteindre :",
            items: [
              'Peu de temps disponible',
              'Forte sollicitation commerciale',
              'Faible efficacité des canaux publicitaires',
            ],
            arrow: "Accès direct à une communauté déjà engagée et identifiée.",
          },
          {
            num: '03',
            title: "Une recommandation vaut plus qu'une publicité",
            body:
              "Un partenariat avec Générations Médecins place votre marque dans un environnement de confiance plutôt qu'une logique publicitaire.",
            arrow:
              'Taux de conversion x 3 lorsque la mise en relation passe par une organisation professionnelle reconnue.',
          },
          {
            num: '04',
            title: 'Des dispositifs générateurs de leads',
            body: 'Nous avons mis en place :',
            items: [
              'Webinaires thématiques',
              'Guides pratiques',
              'Ateliers installation',
              'Événements régionaux',
              'Newsletters ciblées',
              'Campagnes digitales',
              'Prises de RDV qualifiées',
            ],
            arrow:
              "L'objectif n'est pas la visibilité mais la génération de contacts et de nouveaux clients.",
          },
        ],
        closing:
          "Nous ne proposons pas que de la visibilité. Nous proposons un accès privilégié à plusieurs centaines de jeunes médecins au moment précis où ils choisissent leur banque, leur assureur, leur RCP, leur prévoyance et leurs partenaires professionnels.",
      },
    },
    {
      type: 'audience',
      props: {
        eyebrow: "02 • L'opportunité",
        title: 'Notre audience en détail',
        subtitle: 'Une communauté médicale segmentée et activable.',
        segments: [
          { label: 'Spécialistes', share: 70, description: 'Cœur de cible — spé > MG' },
          { label: '< 10 ans depuis le DES', share: 90, description: 'Jeunes médecins en installation' },
          { label: 'Internes', share: 15, description: 'Futurs prescripteurs et décideurs' },
        ],
        channels: [
          { label: 'Mailing', value: '12 000', caption: 'membres actifs (base sondages)' },
          { label: 'LinkedIn', value: '17 000', caption: 'abonnés (Président GM IDF)' },
          { label: 'Events mensuels', value: '360', caption: 'contacts privilégiés lors d\'événements privilégiés' },
          { label: 'Big Event annuel', value: '200', caption: 'participants qualifiés' },
        ],
        callout:
          "Là où tout le monde a déserté le présentiel, nous y maintenons nos événements à pleine capacité — pour créer du lien, fidéliser et bâtir une vraie communauté.",
      },
    },
    {
      type: 'pillars',
      props: {
        eyebrow: "02 • L'opportunité",
        title: "Nos 3 piliers d'activation",
        subtitle: "Trois leviers d'engagement à activer selon vos objectifs partenariat.",
        pillars: [
          {
            num: '01',
            title: 'Newsletter récurrente',
            body:
              "Petites annonces, décryptages d'actualité, contenus pratiques pour la vie professionnelle des médecins.",
            tags: ['12 000 destinataires', 'Hebdomadaire'],
          },
          {
            num: '02',
            title: 'Events mensuels',
            body:
              "Soirées en petit comité, format afterwork qualitatif. Nos événements affichent COMPLET et donnent lieu à des relais sur nos réseaux sociaux.",
            tags: ['10 / an', '30 participants', 'COMPLETS'],
          },
          {
            num: '03',
            title: 'Plateforme & contenus',
            body:
              "Mobilisation, lanceurs d'alerte, SOS juridique, outils d'aide à l'installation, consultation des adhérents.",
            tags: ['Plateforme membre', 'Mise à jour continue'],
          },
        ],
      },
    },
    {
      type: 'events',
      props: {
        eyebrow: '03 • Nos rendez-vous',
        title: 'Events Mensuels',
        subtitle: 'Un talk, une soirée — format afterwork qualitatif, en petit comité.',
        keyFacts: [
          { value: '10', label: 'Événements / an', caption: 'un par mois, hors été' },
          { value: '20–35', label: 'Participants', caption: 'cabinets, salles partenaires' },
          { value: '4', label: 'Thèmes phares', caption: 'innovation, exercice, entrepreneuriat, médico-légal' },
        ],
        program: [
          { time: '19h00', label: 'Accueil & verre de bienvenue' },
          { time: '19h30', label: "Mots d'introduction" },
          { time: '19h40', label: 'Intervention / Témoignage / Atelier' },
          { time: '20h40', label: 'Networking / Cocktail' },
          { time: '22h00', label: 'Fin' },
        ],
        themes: [
          { title: 'Innovation', body: 'Médecine & IA, outils au cabinet' },
          { title: 'Exercice', body: "Centres de santé, s'installer sans s'isoler" },
          { title: 'Entrepreneuriat', body: 'Gestion, finances, développement' },
          { title: 'Médico-légal', body: 'RCP, responsabilité, plaintes, droits du médecin' },
        ],
      },
    },
    {
      type: 'bigEvent',
      props: {
        eyebrow: '03 • Nos rendez-vous',
        title: 'The Big Event',
        subtitle: 'Le grand rendez-vous annuel — peut-être deux à terme',
        meta: [
          { label: 'Public', value: '200 personnes' },
          { label: 'Intervenants', value: 'Partenaires, URPS, ARS, FAF, etc.' },
          { label: 'Format', value: '½ journée + soirée festive' },
          { label: 'Hôte soirée', value: 'House Clinics' },
        ],
        tracks: [
          {
            num: '1',
            title: 'Assistants, CCA, jeunes libéraux',
            audience: '14h30 – 16h30, pause 17h15',
            topics: [
              'Préparer sa carrière : libérale / hospitalière / mixte',
              'Connaître ses droits et statuts : congés, formations, etc.',
              'Comment choisir sa RCP : critères clés à regarder',
            ],
          },
          {
            num: '2',
            title: 'Hospitaliers (PH, PHU, PU-PH)',
            topics: [
              'Connaître ses droits et statuts : congés, formations, etc.',
              "Optimisation fiscale, finance, le libéral à l'hôpital",
              'Comment choisir sa RCP : critères clés à regarder',
            ],
          },
          {
            num: '3',
            title: 'Internes',
            audience: "En rapprochement avec l'ISNI",
            topics: [
              "Mécanismes d'achat, pied à terre",
              'Fiscalité, prêt préférentiel CA',
              'Comment choisir sa RCP : critères clés à regarder',
            ],
          },
        ],
        commonTitle: 'Thèmes communs',
        commonTopics: [
          'Parentalité',
          'Arrêt maladie',
          'Prévoyance',
          'Épuisement professionnel',
          'Santé mentale',
          'Dermascan',
          'IPA',
          'IA en médecine',
          'ESS',
          'Gérer ses salariés',
          'Faire du réseau',
          "Lutter contre l'isolement",
          'Repenser le syndicalisme',
          'Financiarisation',
          'Euthanasie',
          'Directives anticipées',
          'Consentement',
          'Examen clinique au 21e',
          'Plaintes',
          'Religion en médecine',
          'Refuser la CMU',
          'Cotations',
          'Sexologie',
          'Influenceurs médicaux',
        ],
        guest: 'Soirée chez House Clinics',
      },
    },
    {
      type: 'features',
      props: {
        eyebrow: '04 • Plateforme',
        title: 'Notre plateforme membre',
        subtitle: 'Des outils concrets construits par et pour la communauté médicale.',
        features: [
          {
            glyph: '⚖️',
            tag: 'Juridique',
            title: 'SOS juridique',
            body:
              "Une IA juridique + un avocat de garde : plus rapide, plus accessible et plus à jour qu'un juriste classique. Réponses concrètes, contextualisées au droit médical.",
            tools: [
              { name: 'Doctrine', logo: '/logos/Doctrine_logo.png' },
              { name: 'SPI Avocats' },
            ],
          },
          {
            glyph: '🏥',
            tag: 'Carrière',
            title: "Aide à l'installation",
            body:
              "Parcours pas-à-pas : choix du statut, cotations, démarches CPAM, montage de société, fiscalité. Mis à jour en continu par le bureau.",
          },
          {
            glyph: '🗳️',
            tag: 'Démocratie',
            title: 'Consultation des adhérents',
            body:
              'Sondages thématiques, baromètres, votes — chaque adhérent pèse dans les positions du syndicat.',
          },
          {
            glyph: '📢',
            tag: 'Engagement',
            title: "Mobilisation & lanceurs d'alerte",
            body:
              'Espace sécurisé pour signaler des dérives, alimenter le plaidoyer, et coordonner les actions de terrain.',
          },
          {
            glyph: '🧠',
            tag: 'Contenus',
            title: "Décryptages d'actualité",
            body:
              'Newsletter hebdo et fiches courtes : on traduit les évolutions réglementaires et conventionnelles en actions concrètes.',
          },
        ],
      },
    },
    {
      type: 'partnersLogos',
      props: {
        eyebrow: '04 • Nos partenaires',
        title: 'Nos partenaires',
        partners: knownPartners,
      },
    },
    {
      type: 'testimonials',
      props: {
        eyebrow: '04 • Ils en parlent',
        title: 'Retours de nos partenaires',
        subtitle: 'Ce que disent celles et ceux qui ont déjà choisi GM.',
        testimonials: [
          {
            quote:
              "À compléter — citation de Frédéric Faive sur la valeur du partenariat (l'accès aux médecins, la qualité du networking, la conversion qu'ils observent).",
            name: 'Frédéric Faive',
            role: 'Fondateur',
            company: 'One Gestion Privée',
            logo: '/logos/OGP.png',
          },
          {
            quote:
              "À compléter — citation de Mme Grandgirard (engagement réel des équipes, suivi rigoureux, accès qualifié, etc.).",
            name: 'Mme Grandgirard',
            role: 'Responsable',
            company: 'Crédit Agricole IDF',
            logo: '/logos/CA.png',
          },
        ],
      },
    },
    {
      type: 'budget',
      props: {
        eyebrow: '05 • Investissement',
        title: 'Nos besoins pour mener nos actions',
        subtitle: 'Budget annuel global pour déployer le programme 2026 — détaillé poste par poste.',
        items: [
          { label: 'Events mensuels', detail: '4 000 € × 10 événements', amount: 40000, secured: 25 },
          { label: 'Location de salle', detail: 'Lieux events + Big Event', amount: 5000, secured: 100 },
          { label: 'Développement des modules', detail: 'Plateforme membre, SOS juridique, outils', amount: 50000, secured: 25 },
          { label: 'Budget communication', detail: 'Production, réseaux, newsletter, design', amount: 25000, secured: 50 },
          { label: 'Big Event annuel', detail: '200 participants — ½ journée + soirée', amount: 30000, secured: 33 },
        ],
        totalLabel: 'Total annuel',
        securedLabel: 'Déjà sécurisé',
      },
    },
    {
      type: 'packs',
      props: {
        eyebrow: "05 • Comment nous accompagner",
        title: 'Les packs partenaires',
        subtitle:
          "Trois niveaux d'engagement pour vous projeter, avec des contreparties qui montent en intensité.",
        packs: [
          {
            name: 'Initiateur',
            price: '60 K€',
            tagline: 'Pour amorcer une présence forte auprès de notre communauté',
            features: [
              'Logo partenaire sur tous les supports',
              'Mention dans la newsletter mensuelle',
              '2 posts dédiés sur nos réseaux sociaux',
              'Logo sur tous les events GM (10/an)',
              '4 invitations aux events mensuels',
              'Point de contact dédié',
            ],
          },
          {
            name: 'Allié',
            price: '100 K€',
            tagline: "L'allié privilégié — co-construction, visibilité événementielle",
            features: [
              "✦ Inclut l'intégralité de l'Initiateur",
              'Co-organisation complète de 2 events / an',
              'Webinaire co-brandé avec inscriptions et replay',
              'Intervention au Big Event',
              'Affichage dédié sur la plateforme',
              'Reporting trimestriel détaillé',
            ],
          },
          {
            name: 'Mécène',
            price: '150 K€',
            tagline: 'Partenariat premium — votre marque ancrée dans la communauté',
            premium: true,
            features: [
              "✦ Inclut l'intégralité de l'Allié",
              "Naming d'un module (ex : « SOS juridique by X »)",
              'Soirée VIP exclusive avec les KOLs',
              'Prise de parole en ouverture du Big Event',
              'Co-création de contenu (newsletter, podcast)',
              'Accès direct au dashboard reporting',
            ],
          },
        ],
        note: '50 K€ déjà sécurisés via nos partenaires institutionnels. Restent ~100 K€ à mobiliser pour boucler le budget 2026.',
      },
    },
    {
      type: 'charter',
      props: {
        eyebrow: '06 • Engagement',
        title: 'Notre charte de partenariat',
        subtitle: 'Une relation transparente, encadrée et bénéfique pour tous.',
        pillars: [
          { glyph: '§', title: 'Éthique & déontologie', body: "Conformité à l'éthique professionnelle, aux réglementations applicables et à la déontologie médicale." },
          { glyph: '○', title: 'Indépendance', body: "Respect absolu de l'indépendance scientifique et éditoriale de Générations Médecins." },
          { glyph: '◆', title: 'Transparence', body: 'Engagement de transparence sur les actions menées, leurs résultats et le reporting trimestriel.' },
          { glyph: '✚', title: 'Co-création', body: 'Co-construction des projets bénéficiant aux médecins, patients et système de santé.' },
        ],
      },
    },
    {
      type: 'contact',
      props: {
        eyebrow: 'Contact',
        title: 'Construisons ensemble un partenariat utile et visible.',
        body: "Échangeons sur vos objectifs et co-construisons l'activation qui vous ressemble.",
        channels: [
          { glyph: '@', label: 'Email', value: 'idf@generations-medecins.fr' },
          { glyph: '⌂', label: 'Site web', value: 'generations-medecins.fr' },
          { glyph: '▣', label: 'Réseaux', value: 'Insta • LinkedIn • X • Facebook' },
        ],
        footer: 'GÉNÉRATIONS MÉDECINS ÎLE-DE-FRANCE • BOOK PARTENAIRES 2026',
      },
    },
  ],
}
