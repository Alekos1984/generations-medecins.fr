import type { PublicPartner } from '../lib/types'

// Used as fallback when Supabase is not configured or returns no rows.
// Logo files live in book/public/logos/ — drop your PNG with the matching
// filename and it appears automatically.
// Password for every demo partner is "demo" (see api.ts → demoUnlock).
export const demoPartners: PublicPartner[] = [
  { id: '1',  slug: 'credit-agricole',         name: 'Crédit Agricole',          logo_url: '/logos/CA.png',  display_order: 1 },
  { id: '2',  slug: 'la-medicale',             name: 'La Médicale',              logo_url: '/logos/LM.png',  display_order: 2 },
  { id: '3',  slug: 'one-gestion-privee',      name: 'One Gestion Privée',       logo_url: '/logos/OGP.png', display_order: 3 },
  { id: '4',  slug: 'hack-your-care',          name: 'Hack Your Care',           logo_url: '/logos/HYC.png', display_order: 4 },
  { id: '5',  slug: 'neurostim',               name: 'NeuroStim',                logo_url: '/logos/NST.png', display_order: 5 },
  { id: '6',  slug: 'celene',                  name: 'Celene',                   logo_url: '/logos/CLN.jpg', display_order: 6 },
  { id: '7',  slug: 'amarsi',                  name: 'Amarsi',                   logo_url: '/logos/AMA.png', display_order: 7 },
  { id: '8',  slug: 'club-prive-des-medecins', name: 'Club Privé des Médecins',  logo_url: '/logos/CPM.png', display_order: 8 },
  { id: '9',  slug: 'clariane',                name: 'Clariane',                 logo_url: '/logos/CLA.png', display_order: 9 },
  { id: '10', slug: 'nebimage',                name: 'Nebimage',                 logo_url: '/logos/NEB.png', display_order: 10 },
  { id: '11', slug: 'novo-nordisk',            name: 'Novo Nordisk',             logo_url: '/logos/NOV.png', display_order: 11 },
  { id: '12', slug: 'medecins-direct',         name: 'Médecins Direct',          logo_url: '/logos/MeD.png', display_order: 12 },
]
