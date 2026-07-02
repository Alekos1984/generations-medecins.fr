export type PublicPartner = {
  id: string
  slug: string
  name: string
  logo_url: string
  display_order: number
}

export type Slide =
  | { type: 'cover'; props: CoverProps }
  | { type: 'summary'; props: SummaryProps }
  | { type: 'stats'; props: StatsProps }
  | { type: 'manifesto'; props: ManifestoProps }
  | { type: 'bureau'; props: BureauProps }
  | { type: 'benefits'; props: BenefitsProps }
  | { type: 'audience'; props: AudienceProps }
  | { type: 'pillars'; props: PillarsProps }
  | { type: 'events'; props: EventsProps }
  | { type: 'projects'; props: ProjectsProps }
  | { type: 'bigEvent'; props: BigEventProps }
  | { type: 'eventsAll'; props: EventsAllProps }
  | { type: 'workingGroups'; props: WorkingGroupsProps }
  | { type: 'strategy'; props: StrategyProps }
  | { type: 'features'; props: FeaturesProps }
  | { type: 'partnersLogos'; props: PartnersLogosProps }
  | { type: 'budget'; props: BudgetProps }
  | { type: 'testimonials'; props: TestimonialsProps }
  | { type: 'media'; props: MediaProps }
  | { type: 'packs'; props: PacksProps }
  | { type: 'partnersGrid'; props: PartnersGridProps }
  | { type: 'visibility'; props: VisibilityProps }
  | { type: 'plan'; props: PlanProps }
  | { type: 'plansCompare'; props: PlansCompareProps }
  | { type: 'modules'; props: ModulesProps }
  | { type: 'options'; props: OptionsProps }
  | { type: 'charter'; props: CharterProps }
  | { type: 'contact'; props: ContactProps }

export type SlideType = Slide['type']

export type Book = {
  title: string
  partnerLogoUrl?: string | null
  partnerName?: string | null
  slides: Slide[]
}

export type BookEnvelope = {
  book: Book
  partner: PublicPartner | null
}

// --------- Slide prop shapes ---------

export type CoverProps = {
  eyebrow?: string
  brand?: string
  titleLines: string[]
  subtitle?: string
  footer?: string
}

export type SummaryItem = {
  chapter: string
  title: string
  description: string
  range: string
}
export type SummaryProps = {
  eyebrow?: string
  title: string
  items: SummaryItem[]
}

export type StatItem = {
  label: string
  prefix?: string
  value: number
  suffix?: string
  caption: string
}
export type StatsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  stats: StatItem[]
  quote?: string
}

export type ManifestoProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  verbs: string[]
  body: string
  pillars: { num: string; title: string; text: string }[]
}

export type BureauMember = {
  initials: string
  name: string
  role: string
  specialty?: string
  details?: string
  highlights?: string[]
  photoUrl?: string
  small?: boolean
}
export type BureauProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  members: BureauMember[]
  footnote?: string
}

export type Benefit = {
  num: string
  title: string
  body: string
  items?: string[]
  arrow: string
}
export type BenefitsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  benefits: Benefit[]
  closing?: string
}

export type AudienceSegment = { label: string; share: number; description: string }
export type AudienceChannel = { label: string; value: string; caption: string }
export type AudienceProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  segments: AudienceSegment[]
  channels: AudienceChannel[]
  callout?: string
}

export type PillarsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  pillars: { num: string; title: string; body: string; tags: string[] }[]
}

export type EventsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  keyFacts: { value: string; label: string; caption?: string }[]
  program: { time: string; label: string }[]
  themes: { title: string; body: string }[]
}

export type ProjectsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  cards: { title: string; tag: string; arrow: string }[]
  footnote?: string
}

export type PartnersGridProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  partners: { name: string; tagline: string; body: string }[]
  quote?: string
}

export type VisibilityProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  zones: { kicker: string; label: string; caption: string }[]
  footnote?: string
}

export type PlanProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  tier: 'BRONZE' | 'ARGENT' | 'OR'
  price: string
  priceCaption: string
  premium?: boolean
  features: string[]
}

export type PlansCompareProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  tiers: { name: string; price: string; premium?: boolean }[]
  features: string[]
  matrix: boolean[][]
}

export type ModulesProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  modules: { name: string; price: string; body: string }[]
  footnote?: string
}

export type OptionsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  options: { name: string; body: string }[]
  footnote?: string
}

export type CharterProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  pillars: { glyph: string; title: string; body: string }[]
}

export type ContactProps = {
  eyebrow?: string
  title: string
  body?: string
  channels: { glyph: string; label: string; value: string }[]
  footer?: string
}

export type EventsAllProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  monthly: {
    kicker?: string
    heading: string
    facts: { value: string; label: string }[]
    themes: string[]
    footnote?: string
  }
  bigEvent: {
    kicker?: string
    heading: string
    facts: { value: string; label: string }[]
    tracks: string[]
    guest?: string
  }
}

export type StrategyProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  axes: {
    num: string
    title: string
    tags: string[]
  }[]
  propositions?: {
    title?: string
    intro?: string
    items: string[]
  }
}

export type WorkingGroupsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  groups: {
    name: string
    theme?: string
    lead?: string
    leadRole?: string
  }[]
  footnote?: string
}

export type BigEventProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  meta: { label: string; value: string }[]
  tracks: { num: string; title: string; audience?: string; topics: string[] }[]
  commonTitle?: string
  commonTopics: string[]
  guest?: string
}

export type FeaturesProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  features: {
    glyph: string
    tag?: string
    title: string
    body: string
    tools?: { name: string; logo?: string }[]
  }[]
}

export type PartnersLogosProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  partners: { name: string; logo: string }[]
  highlightName?: string
  inviteSlot?: boolean
  inviteText?: string
}

export type BudgetProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  items: { label: string; detail?: string; amount: number; secured?: number }[]
  currency?: string
  totalLabel?: string
  securedLabel?: string
}

export type TestimonialItem = {
  quote: string
  name: string
  role?: string
  company?: string
  logo?: string
}
export type InstagramCard = {
  image: string
  username?: string
  caption?: string
  likes?: number
  location?: string
}
export type TestimonialsProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  testimonials: TestimonialItem[]
  instagram?: InstagramCard
}

export type MediaTile = {
  kicker?: string
  name: string
  caption?: string
  image: string
}
export type MediaProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  tiles: MediaTile[]
  footnote?: string
}

export type PackTier = {
  name: string
  price: string
  tagline?: string
  features: string[]
  premium?: boolean
}
export type PacksProps = {
  eyebrow?: string
  title: string
  subtitle?: string
  packs: PackTier[]
  note?: string
}
