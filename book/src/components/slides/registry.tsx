import type { Slide } from '../../lib/types'
import Cover from './Cover'
import Summary from './Summary'
import Stats from './Stats'
import Manifesto from './Manifesto'
import Bureau from './Bureau'
import Benefits from './Benefits'
import Audience from './Audience'
import Pillars from './Pillars'
import Events from './Events'
import Projects from './Projects'
import BigEvent from './BigEvent'
import EventsAll from './EventsAll'
import WorkingGroups from './WorkingGroups'
import Strategy from './Strategy'
import Features from './Features'
import PartnersLogos from './PartnersLogos'
import Budget from './Budget'
import Testimonials from './Testimonials'
import Media from './Media'
import Packs from './Packs'
import PartnersGrid from './PartnersGrid'
import Visibility from './Visibility'
import Plan from './Plan'
import PlansCompare from './PlansCompare'
import Modules from './Modules'
import Options from './Options'
import Charter from './Charter'
import Contact from './Contact'

export type SlideContext = {
  partnerLogoUrl?: string | null
  partnerName?: string | null
}

export function renderSlide(slide: Slide, ctx: SlideContext) {
  switch (slide.type) {
    case 'cover':
      return <Cover {...slide.props} ctx={ctx} />
    case 'summary':
      return <Summary {...slide.props} />
    case 'stats':
      return <Stats {...slide.props} />
    case 'manifesto':
      return <Manifesto {...slide.props} />
    case 'bureau':
      return <Bureau {...slide.props} />
    case 'benefits':
      return <Benefits {...slide.props} />
    case 'audience':
      return <Audience {...slide.props} />
    case 'pillars':
      return <Pillars {...slide.props} />
    case 'events':
      return <Events {...slide.props} />
    case 'projects':
      return <Projects {...slide.props} />
    case 'bigEvent':
      return <BigEvent {...slide.props} />
    case 'eventsAll':
      return <EventsAll {...slide.props} />
    case 'workingGroups':
      return <WorkingGroups {...slide.props} />
    case 'strategy':
      return <Strategy {...slide.props} />
    case 'features':
      return <Features {...slide.props} />
    case 'partnersLogos':
      return (
        <PartnersLogos
          {...slide.props}
          highlightName={slide.props.highlightName ?? ctx.partnerName ?? undefined}
        />
      )
    case 'budget':
      return <Budget {...slide.props} />
    case 'testimonials':
      return <Testimonials {...slide.props} />
    case 'media':
      return <Media {...slide.props} />
    case 'packs':
      return <Packs {...slide.props} />
    case 'partnersGrid':
      return <PartnersGrid {...slide.props} />
    case 'visibility':
      return <Visibility {...slide.props} />
    case 'plan':
      return <Plan {...slide.props} />
    case 'plansCompare':
      return <PlansCompare {...slide.props} />
    case 'modules':
      return <Modules {...slide.props} />
    case 'options':
      return <Options {...slide.props} />
    case 'charter':
      return <Charter {...slide.props} />
    case 'contact':
      return <Contact {...slide.props} />
  }
}
