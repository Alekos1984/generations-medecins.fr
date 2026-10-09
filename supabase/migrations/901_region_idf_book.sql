-- Custom book variant for region-idf
update public.partner_books
   set slides = $book$[
  {
    "type": "cover",
    "props": {
      "eyebrow": "PROGRAMME • ÎLE-DE-FRANCE 2027",
      "brand": "GÉNÉRATIONS MÉDECINS × RÉGION ÎLE-DE-FRANCE",
      "titleLines": [
        "Améliorer",
        "l'exercice",
        "des médecins",
        "franciliens."
      ],
      "subtitle": "Des projets construits avec le terrain, pour attirer les médecins, les aider à mieux exercer et leur donner envie de rester.\nRencontre · octobre 2026 · Anciennement Jeunes Médecins IDF.",
      "footer": "PROGRAMME · ÎLE-DE-FRANCE · 2027"
    }
  },
  {
    "type": "summary",
    "props": {
      "title": "Sommaire",
      "items": [
        {
          "chapter": "01",
          "title": "Qui porte le programme ?",
          "description": "Équipe, bureau multi-spé, 6 groupes de travail",
          "range": "Slides 03 – 05"
        },
        {
          "chapter": "02",
          "title": "Ambition commune",
          "description": "Identifier, expérimenter, mesurer, déployer",
          "range": "Slide 06"
        },
        {
          "chapter": "03",
          "title": "Les 3 projets Phase 1",
          "description": "Santé mentale, mobilité, baromètre",
          "range": "Slides 07 – 11"
        },
        {
          "chapter": "04",
          "title": "Et après",
          "description": "3 chantiers Phase 2 + Académie GM",
          "range": "Slide 12"
        },
        {
          "chapter": "05",
          "title": "Partenariat & engagement",
          "description": "Convention 300 k€ Phase 1",
          "range": "Slides 13 – 14"
        }
      ]
    }
  },
  {
    "type": "stats",
    "props": {
      "eyebrow": "Notre réseau",
      "title": "Un réseau mobilisable, un ancrage francilien",
      "subtitle": "Au cœur du 1er désert médical français.",
      "stats": [
        {
          "label": "Réseau national",
          "value": 6000,
          "suffix": "+",
          "caption": "médecins mobilisables"
        },
        {
          "label": "Adhérents IDF",
          "value": 2000,
          "suffix": "+",
          "caption": "en Île-de-France"
        },
        {
          "label": "Chantiers 2027",
          "value": 6,
          "caption": "projets pour les franciliens"
        },
        {
          "label": "Soirées/an",
          "value": 10,
          "caption": "affichent complet"
        },
        {
          "label": "Contacts actifs",
          "value": 12000,
          "caption": "plateforme Médecins En Grève"
        }
      ]
    }
  },
  {
    "type": "bureau",
    "props": {
      "eyebrow": "01 • L'équipe qui porte le programme",
      "title": "Un programme porté par des médecins en exercice",
      "subtitle": "Deux pilotes, et un bureau multi-spécialités derrière.",
      "members": [
        {
          "initials": "AB",
          "name": "Dr. Alexis BOURLA",
          "role": "Président",
          "specialty": "Psychiatre, praticien hospitalier chercheur — Saint-Antoine (AP-HP), ICRIN-ICM",
          "highlights": [
            "Cofondateur de NeuroStim, 1er réseau de psychiatrie libérale (18k patients en file active)",
            "Président de Cline Research",
            "Directeur des projets psychiatriques, groupe Clariane"
          ],
          "photoUrl": "/bureau/AB.png"
        },
        {
          "initials": "MT",
          "name": "Dr. Minh-Hanh TA",
          "role": "Chargée de mission",
          "specialty": "Onco-radiothérapeute, ancienne CCA Hôpital Tenon (AP-HP)",
          "highlights": [
            "Formée à Curie, Gustave Roussy, Pitié-Salpêtrière, CHUV Lausanne",
            "Ancienne vice-présidente nationale de la SFjRO",
            "Board médical de RésoRose et Celene Care (santé des femmes, cancer du sein)",
            "Membre AFSOS, SFRO, ESTRO, ESMO"
          ],
          "photoUrl": "/bureau/MHT.png"
        }
      ],
      "footnote": "Un pilotage opérationnel assuré par deux médecins en exercice, encadré par un bureau multi-spécialités (voir slide suivante)."
    }
  },
  {
    "type": "bureau",
    "props": {
      "eyebrow": "01 • Un bureau représentatif de l'exercice francilien",
      "title": "Hôpital, ville, spécialités : tout l'exercice autour de la table",
      "subtitle": "Six vice-présidents et chargés de mission, chacun référent d'un groupe de travail.",
      "members": [
        {
          "initials": "FV",
          "name": "Pr. Franck VERDONK",
          "role": "Trésorier",
          "specialty": "Anesthésiste-réanimateur",
          "details": "Chef de Service Réanimation — Saint-Antoine",
          "photoUrl": "/bureau/FV.jpeg"
        },
        {
          "initials": "PH",
          "name": "Dr. Pierre HAMANN",
          "role": "Vice-président",
          "specialty": "Dermatologue",
          "details": "Chef de Service Dermatologie — Kremlin-Bicêtre",
          "photoUrl": "/bureau/PH.png"
        },
        {
          "initials": "CC",
          "name": "Dr. Cherifa CHEURFA",
          "role": "Vice-présidente",
          "specialty": "Anesthésiste-réanimatrice",
          "photoUrl": "/bureau/CC.png"
        },
        {
          "initials": "LK",
          "name": "Dr. Louise-Anne KLEIN",
          "role": "Vice-présidente",
          "specialty": "Gynécologue obstétricienne",
          "photoUrl": "/bureau/LAK.png"
        },
        {
          "initials": "SH",
          "name": "Dr. Soraya HUGAIN",
          "role": "Chargée de mission",
          "specialty": "Psychiatre hospitalière — Sainte-Anne",
          "details": "Représentante à la commission régionale paritaire",
          "photoUrl": "/bureau/SH.png"
        },
        {
          "initials": "RB",
          "name": "Dr. Rivka BENDRIHEM",
          "role": "Chargée de mission",
          "specialty": "Radiologue",
          "details": "Ancienne présidente de l'UNIR",
          "photoUrl": "/bureau/RB.png"
        }
      ],
      "footnote": "6 groupes de travail, un référent chacun : Installation & exercice mixte • Convention & tarifications • Médico-légal & RCP • Fiscalité & gestion du cabinet • Innovation & IA • Santé mentale & épuisement professionnel (animé par Dr Hugain)."
    }
  },
  {
    "type": "media",
    "props": {
      "eyebrow": "01 • Présence dans les médias",
      "title": "Une voix qui porte",
      "subtitle": "Plateaux TV et presse médicale — GM est au cœur du débat médical.",
      "tiles": [
        {
          "kicker": "Plateau TV",
          "name": "New Deal Santé",
          "caption": "Le show de Martin Blachier",
          "image": "/media/new-deal-sante.png"
        },
        {
          "kicker": "Presse médicale",
          "name": "Egora",
          "caption": "Couverture des prises de position du syndicat",
          "image": "/media/Egora.png"
        }
      ],
      "footnote": "Des prises de parole régulières qui renforcent la légitimité du réseau auprès des prescripteurs."
    }
  },
  {
    "type": "benefits",
    "props": {
      "eyebrow": "02 • Une ambition commune",
      "title": "Faire de Générations Médecins un partenaire opérationnel de la Région",
      "subtitle": "« L'Île-de-France est le 1er désert médical français. »  — Région Île-de-France, 2025",
      "benefits": [
        {
          "num": "01",
          "title": "Identifier",
          "body": "Les besoins réels du terrain, par la remontée directe de nos adhérents.",
          "arrow": "Nous captons ce qui se passe vraiment dans les cabinets et les services."
        },
        {
          "num": "02",
          "title": "Expérimenter",
          "body": "Des solutions concrètes, testées sur notre base avant tout déploiement.",
          "arrow": "Pas de politique sortie du chapeau — des pilotes mesurés."
        },
        {
          "num": "03",
          "title": "Mesurer",
          "body": "Leur impact réel : recours, délais, satisfaction, évolution des besoins.",
          "arrow": "Chaque action financée doit prouver ce qu'elle produit."
        },
        {
          "num": "04",
          "title": "Déployer",
          "body": "Directement auprès des médecins — relais par nos canaux (newsletter, events, plateforme).",
          "arrow": "Un pont court entre la Région et ceux qui soignent."
        }
      ],
      "closing": "Nos atouts : plusieurs milliers de médecins mobilisables, des remontées rapides du terrain, 10 soirées par an qui affichent complet, et une plateforme Médecins En Grève avec 12 000 contacts actifs."
    }
  },
  {
    "type": "workingGroups",
    "props": {
      "eyebrow": "02 • Le programme 2027",
      "title": "Six chantiers pour les médecins franciliens",
      "subtitle": "Trois chantiers Phase 1 (2027), trois chantiers à construire ensuite après évaluation.",
      "groups": [
        {
          "name": "Médecins en santé",
          "theme": "Phase 1 · 2027",
          "lead": "Santé mentale des médecins",
          "leadRole": "Pilote régional 12 mois · 185 k€"
        },
        {
          "name": "Médecins en mouvement",
          "theme": "Phase 1 · 2027",
          "lead": "Mobilité et reconnaissance",
          "leadRole": "Première expérimentation · 65 k€"
        },
        {
          "name": "Le pouls des médecins",
          "theme": "Phase 1 · 2027",
          "lead": "Baromètre franciliens",
          "leadRole": "Deux vagues par an · 50 k€"
        },
        {
          "name": "Exercer durablement",
          "theme": "Ensuite",
          "lead": "Installation, maintien & immobilier",
          "leadRole": "50 à 100 k€ · après évaluation"
        },
        {
          "name": "Soigner en sécurité",
          "theme": "Ensuite",
          "lead": "Sécurité des médecins",
          "leadRole": "50 à 75 k€ · après évaluation"
        },
        {
          "name": "S'installer après le DJ",
          "theme": "Ensuite",
          "lead": "Docteurs juniors & attractivité",
          "leadRole": "50 à 100 k€/an · après évaluation"
        }
      ],
      "footnote": "Un principe transversal : mesurer l'impact de chaque action financée. Chaque chantier a un référent, des livrables et un budget borné."
    }
  },
  {
    "type": "benefits",
    "props": {
      "eyebrow": "03 • Projet phare · Santé mentale des médecins",
      "title": "Un dispositif régional d'accès rapide aux soins",
      "subtitle": "Chez les médecins, demander de l'aide est particulièrement difficile quand on appartient soi-même au système de soins.",
      "benefits": [
        {
          "num": "01",
          "title": "Le constat",
          "body": "Un cumul de risques spécifiques à la profession :",
          "items": [
            "Burn-out",
            "Anxiété, dépression",
            "Addictions",
            "Risque suicidaire",
            "Conflits professionnels",
            "Violences sexistes et sexuelles"
          ],
          "arrow": "Peu de dispositifs adaptés aux contraintes du soignant-soigné."
        },
        {
          "num": "02",
          "title": "Une porte d'entrée unique",
          "body": "Évaluation rapide → orientation adaptée → suivi, selon la situation :",
          "items": [
            "Psychologue",
            "Psychiatre",
            "Addictologue",
            "Médecin du travail",
            "Accompagnement juridique ou social"
          ],
          "arrow": "Il ne remplace pas le soin existant : il organise l'accès et lève les obstacles au recours aux soins."
        }
      ],
      "closing": "« Les médecins aussi ont le droit de prendre soin d'eux. » — Le dispositif se construit avec les psychiatres, psychologues et addictologues franciliens volontaires."
    }
  },
  {
    "type": "budget",
    "props": {
      "eyebrow": "03 • « Médecins en santé » · pilote régional",
      "title": "Un pilote de 12 mois, budgété et évalué",
      "subtitle": "Plateforme numérique · réseau francilien · consultations rapides · campagne régionale · évaluation scientifique.",
      "items": [
        {
          "label": "Plateforme et outils numériques",
          "detail": "Information, auto-évaluation, prise de contact, orientation",
          "amount": 70000,
          "secured": 0
        },
        {
          "label": "Coordination (0,5 ETP)",
          "detail": "Pilotage opérationnel du dispositif",
          "amount": 40000,
          "secured": 0
        },
        {
          "label": "Permanence et orientation",
          "detail": "Psychiatres / psychologues / addictologues volontaires + réseau NeuroStim",
          "amount": 35000,
          "secured": 0
        },
        {
          "label": "Communication",
          "detail": "« Les médecins aussi ont le droit de prendre soin d'eux »",
          "amount": 25000,
          "secured": 0
        },
        {
          "label": "Évaluation et baromètre dédié",
          "detail": "Recours, délais, satisfaction, évolution des besoins",
          "amount": 15000,
          "secured": 0
        }
      ],
      "totalLabel": "Budget pilote · 12 mois",
      "securedLabel": "Convention Région sollicitée"
    }
  },
  {
    "type": "benefits",
    "props": {
      "eyebrow": "03 • Projet 2 · Mobilité et reconnaissance",
      "title": "« Médecins en mouvement » : un geste fort pour les médecins",
      "subtitle": "Les médecins ont le sentiment d'être de moins en moins considérés. La Région peut leur montrer qu'elle prend soin de ceux qui soignent.",
      "benefits": [
        {
          "num": "🚇",
          "title": "Transports gratuits",
          "body": "Un passe Navigo offert aux médecins qui exercent en Île-de-France.",
          "arrow": "Un symbole fort, un coût modeste pour la Région."
        },
        {
          "num": "🅿️",
          "title": "Stationnement gratuit",
          "body": "Pour les médecins en exercice, à commencer par les visites à domicile.",
          "arrow": "Lever l'obstacle numéro un à la visite à domicile."
        },
        {
          "num": "🚉",
          "title": "Parcs relais gratuits",
          "body": "Aux abords des gares, pour rejoindre facilement Paris.",
          "arrow": "Facilite le trajet quotidien pour les praticiens de grande couronne."
        }
      ],
      "closing": "Pilote à construire avec Île-de-France Mobilités et les collectivités, en commençant par 2-3 territoires. Budget 100 à 200 k€, dont 65 k€ en Phase 1 (pilotage, communication, évaluation)."
    }
  },
  {
    "type": "pillars",
    "props": {
      "eyebrow": "03 • Projet 3 · Mesurer pour décider",
      "title": "« Le pouls des médecins d'Île-de-France »",
      "subtitle": "Deux vagues par an, un rapport annuel : « État de l'exercice médical en Île-de-France ».",
      "pillars": [
        {
          "num": "01",
          "title": "Un socle stable, tous les 6 mois",
          "body": "Conditions d'exercice, satisfaction, sécurité, intention de quitter ou changer d'exercice, attractivité territoriale, accès aux soins, charge administrative, connaissance des dispositifs régionaux, santé mentale.",
          "tags": [
            "Vague 1",
            "Vague 2"
          ]
        },
        {
          "num": "02",
          "title": "Un dossier thématique par vague",
          "body": "Mobilité · Installation · Violences · IA · Docteurs juniors · Exercice hospitalier · Féminisation et parentalité. Chaque vague approfondit un thème.",
          "tags": [
            "Thème focus",
            "Profondeur qualitative"
          ]
        },
        {
          "num": "03",
          "title": "Un rapport annuel public",
          "body": "Médecins En Grève le prouve : 12 000 contacts actifs, résultats rapides. Budget 30 à 50 k€/an — 50 k€ en Phase 1.",
          "tags": [
            "12 000 contacts",
            "2 vagues/an",
            "50 k€"
          ]
        }
      ]
    }
  },
  {
    "type": "workingGroups",
    "props": {
      "eyebrow": "04 • Phase 2 · Après évaluation",
      "title": "Trois chantiers à construire ensemble",
      "subtitle": "Déclenchés après l'évaluation des 3 projets Phase 1. Chaque chantier est en complément d'un dispositif régional existant.",
      "groups": [
        {
          "name": "Exercer durablement en Île-de-France",
          "theme": "50 à 100 k€",
          "lead": "Installation, maintien et immobilier médical",
          "leadRole": "Pourquoi un médecin s'installe-t-il, et pourquoi reste-t-il ? Tests sur locaux vacants transformés en cabinets à loyer maîtrisé. En complément de 72 M€ investis par la Région depuis 2016."
        },
        {
          "name": "Soigner en sécurité",
          "theme": "50 à 75 k€",
          "lead": "Observatoire + dispositifs",
          "leadRole": "Observatoire des agressions, sous-déclarations, renoncements. Puis tests : boutons d'alerte, dispositifs mobiles, protocoles forces de sécurité. En complément de l'aide régionale à la sécurisation des cabinets."
        },
        {
          "name": "S'installer après le DJ",
          "theme": "50 à 100 k€/an",
          "lead": "Changer d'indicateur",
          "leadRole": "Non plus « combien de docteurs juniors accueillis ? », mais « combien exercent encore 3 ans plus tard ? ». Accueil, mentorat, réseau local, suivi à 12/24/36 mois. En complément de l'aide régionale à l'hébergement des soignants."
        }
      ],
      "footnote": "Axe complémentaire : Académie GM — formations courtes (installation, management, droit médical, IA, VSS, santé mentale) · 50 à 80 k€/an."
    }
  },
  {
    "type": "budget",
    "props": {
      "eyebrow": "05 • Un partenariat opérationnel 2027",
      "title": "Un programme en briques, une demande Phase 1 claire",
      "subtitle": "Pas une subvention de fonctionnement : trois projets identifiés, avec livrables, indicateurs, budget et évaluation.",
      "items": [
        {
          "label": "Médecins en santé",
          "detail": "Pilote régional santé mentale — 12 mois",
          "amount": 185000,
          "secured": 0
        },
        {
          "label": "Médecins en mouvement",
          "detail": "Pilote mobilité — Phase 1 (65 k€ sur 100-200 k€)",
          "amount": 65000,
          "secured": 0
        },
        {
          "label": "Le pouls des médecins",
          "detail": "Baromètre franciliens — 2 vagues (50 k€ sur 30-50 k€/an)",
          "amount": 50000,
          "secured": 0
        }
      ],
      "totalLabel": "Notre demande · Phase 1 · 12 mois",
      "securedLabel": "Convention Région × Générations Médecins"
    }
  },
  {
    "type": "partnersLogos",
    "props": {
      "eyebrow": "04 • Nos partenaires",
      "title": "Nos partenaires",
      "partners": [
        {
          "name": "Crédit Agricole",
          "logo": "/logos/CA.png"
        },
        {
          "name": "La Médicale",
          "logo": "/logos/LM.png"
        },
        {
          "name": "One Gestion Privée",
          "logo": "/logos/OGP.png"
        },
        {
          "name": "Hack Your Care",
          "logo": "/logos/HYC.png"
        },
        {
          "name": "NeuroStim",
          "logo": "/logos/NST.png"
        },
        {
          "name": "Celene",
          "logo": "/logos/CLN.jpg"
        },
        {
          "name": "Amarsi",
          "logo": "/logos/AMA.png"
        },
        {
          "name": "Club Privé des Médecins",
          "logo": "/logos/CPM.png"
        },
        {
          "name": "Clariane",
          "logo": "/logos/CLA.png"
        },
        {
          "name": "Nebimage",
          "logo": "/logos/NEB.png"
        },
        {
          "name": "Novo Nordisk",
          "logo": "/logos/NOV.png"
        },
        {
          "name": "Médecins Direct",
          "logo": "/logos/MeD.png"
        },
        {
          "name": "DGOS",
          "logo": "/logos/DGOS.png"
        },
        {
          "name": "LCL",
          "logo": "/logos/LCL.png"
        }
      ],
      "subtitle": "Ils nous accompagnent déjà sur nos actions.",
      "highlightName": ""
    }
  },
  {
    "type": "contact",
    "props": {
      "eyebrow": "Notre engagement",
      "title": "Construire avec la Région, expérimenter sur le terrain, mesurer ce qui marche.",
      "body": "Générations Médecins ne souhaite pas seulement représenter les médecins auprès de la Région. Nous voulons construire avec elle des solutions, les expérimenter sur le terrain et mesurer leur efficacité. Dès 2027, trois projets : « Médecins en santé » (185 k€) · « Médecins en mouvement » (65 k€ Phase 1) · « Le pouls des médecins » (50 k€).",
      "channels": [
        {
          "glyph": "@",
          "label": "Email",
          "value": "idf@generations-medecins.fr"
        },
        {
          "glyph": "⌂",
          "label": "Site web",
          "value": "generations-medecins.fr"
        },
        {
          "glyph": "★",
          "label": "Demande Phase 1",
          "value": "Convention 300 k€"
        }
      ],
      "footer": "GÉNÉRATIONS MÉDECINS · ÎLE-DE-FRANCE · ANCIENNEMENT JEUNES MÉDECINS IDF"
    }
  }
]$book$::jsonb,
       updated_at = now()
 where partner_id = (select id from public.partners where slug = 'region-idf');
select jsonb_array_length(slides) as nb_slides
  from public.partner_books
  where partner_id = (select id from public.partners where slug = 'region-idf');
