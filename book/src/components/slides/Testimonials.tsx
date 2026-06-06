import { motion } from 'framer-motion'
import type { InstagramCard, TestimonialsProps } from '../../lib/types'
import { fadeUp, stagger, VIEWPORT_ONCE } from './_anim'

// Suppress unused import warnings when the helpers below aren't reached.
void fadeUp
void stagger

export default function Testimonials(props: TestimonialsProps) {
  const hasInstagram = !!props.instagram
  const singleTestimonial = props.testimonials.length === 1
  // Single-testimonial + instagram → side-by-side. Otherwise normal grid.
  const sideBySide = hasInstagram && singleTestimonial

  return (
    <div className="h-full w-full flex flex-col">
      <div className="eyebrow">{props.eyebrow ?? '04 • Témoignages'}</div>
      <h2 className="h-display text-[58px] leading-tight mt-3 text-white">{props.title}</h2>
      <div className="gold-bar mt-3" />
      {props.subtitle && <p className="mt-3 text-[17px] text-navy-200 max-w-[1000px]">{props.subtitle}</p>}

      {sideBySide ? (
        <div className="mt-8 grid grid-cols-12 gap-8 flex-1 min-h-0">
          <div className="col-span-7">
            <TestimonialFigure t={props.testimonials[0]} index={0} />
          </div>
          <div className="col-span-5 flex items-center justify-center">
            <InstagramFrame card={props.instagram!} />
          </div>
        </div>
      ) : (
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT_ONCE}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="mt-8 grid grid-cols-2 gap-6 flex-1 min-h-0"
        >
          {props.testimonials.map((t, i) => (
            <TestimonialFigure key={`${t.name}-${i}`} t={t} index={i} />
          ))}
        </motion.div>
      )}
    </div>
  )
}

function TestimonialFigure({ t, index }: { t: TestimonialsProps['testimonials'][number]; index: number }) {
  return (
    <motion.figure
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT_ONCE}
      transition={{ delay: 0.1 + index * 0.1, duration: 0.6 }}
      className="relative h-full rounded-2xl bg-white/[0.04] border border-white/5 p-8 overflow-hidden flex flex-col"
    >
      <span className="absolute top-3 left-4 text-gold-500 text-7xl leading-none font-serif select-none">“</span>
      <blockquote className="relative mt-8 text-[17px] leading-relaxed text-white/95 italic flex-1 whitespace-pre-line">
        {t.quote}
      </blockquote>
      <figcaption className="mt-6 pt-5 border-t border-white/10 flex items-center gap-4">
        <div className="flex-none w-12 h-12 rounded-full bg-white ring-1 ring-gold-500/30 grid place-items-center overflow-hidden">
          {t.logo ? (
            <img src={t.logo} alt={t.company ?? t.name} className="max-w-[70%] max-h-[70%] object-contain" />
          ) : (
            <span className="h-display text-navy-900 text-[18px]">
              {(t.name.split(' ').slice(0, 2).map((w) => w[0]).join('') || '').toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white">{t.name}</div>
          <div className="text-[12px] text-gold-400 uppercase tracking-widest">
            {[t.role, t.company].filter(Boolean).join(' • ')}
          </div>
        </div>
      </figcaption>
    </motion.figure>
  )
}

function InstagramFrame({ card }: { card: InstagramCard }) {
  const username = card.username ?? 'generations_medecins'
  const likes = card.likes ?? 247
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, rotate: -1.2 }}
      whileInView={{ opacity: 1, scale: 1, rotate: -1.2 }}
      viewport={VIEWPORT_ONCE}
      transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1], delay: 0.2 }}
      whileHover={{ rotate: 0, scale: 1.02 }}
      className="w-full max-w-[440px] bg-white rounded-2xl overflow-hidden"
      style={{ boxShadow: '0 40px 80px -20px rgba(0,0,0,0.6)' }}
    >
      {/* IG header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-navy-100/50">
        <div
          className="w-9 h-9 rounded-full p-[2px]"
          style={{
            background:
              'conic-gradient(from 0deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75)',
          }}
        >
          <div className="w-full h-full rounded-full bg-white grid place-items-center overflow-hidden">
            <img
              src="/gm-logo.jpeg"
              alt="GM"
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-navy-900 leading-tight">{username}</div>
          {card.location && (
            <div className="text-[11px] text-navy-500 leading-tight">{card.location}</div>
          )}
        </div>
        <span className="text-navy-400 text-lg leading-none">⋯</span>
      </div>

      {/* Photo square */}
      <div className="relative bg-navy-100">
        <div className="aspect-square">
          <img
            src={card.image}
            alt="Event"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      </div>

      {/* IG action bar */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-center gap-3 text-navy-800">
          <Heart />
          <Comment />
          <Send />
          <span className="ml-auto">
            <Bookmark />
          </span>
        </div>
        <div className="mt-2 text-[13px] font-semibold text-navy-900">
          {likes.toLocaleString('fr-FR')} mentions J'aime
        </div>
        {card.caption && (
          <p className="mt-1.5 text-[13px] text-navy-800 leading-snug">
            <span className="font-semibold">{username}</span>{' '}
            <span className="whitespace-pre-line">{card.caption}</span>
          </p>
        )}
        <div className="mt-2 text-[10px] uppercase tracking-widest text-navy-400">
          Il y a 2 jours
        </div>
      </div>
    </motion.div>
  )
}

function Heart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
function Comment() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
function Send() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
function Bookmark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}
