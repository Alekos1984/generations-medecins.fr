import { motion } from 'framer-motion'
import type { EventsAllProps } from '../../lib/types'
import { fadeUp, stagger, VIEWPORT_ONCE } from './_anim'

export default function EventsAll(props: EventsAllProps) {
  return (
    <div className="h-full w-full flex flex-col">
      <div className="eyebrow">{props.eyebrow ?? '03 • Nos rendez-vous'}</div>
      <h2 className="h-display text-[54px] leading-tight mt-3 text-white">{props.title}</h2>
      <div className="gold-bar mt-3" />
      {props.subtitle && <p className="mt-3 text-[17px] text-navy-200 max-w-[1100px]">{props.subtitle}</p>}

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
        variants={stagger}
        className="mt-7 grid grid-cols-2 gap-6 flex-1 min-h-0"
      >
        {/* LEFT — Monthly events */}
        <motion.div
          variants={fadeUp}
          className="relative rounded-2xl bg-white/[0.04] border border-white/5 p-7 flex flex-col overflow-hidden"
        >
          {props.monthly.kicker && (
            <div className="text-[12px] tracking-[0.3em] uppercase text-gold-500">
              {props.monthly.kicker}
            </div>
          )}
          <div className="mt-2 h-display text-[32px] leading-tight text-white">{props.monthly.heading}</div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            {props.monthly.facts.map((f) => (
              <div key={f.label} className="rounded-xl border border-white/5 bg-navy-800/40 px-4 py-3">
                <div className="h-display text-[32px] leading-none text-white">{f.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-accent-soft">{f.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-[11px] tracking-[0.3em] uppercase text-gold-500">Thèmes phares</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {props.monthly.themes.map((t) => (
                <span
                  key={t}
                  className="text-[13px] px-3 py-1.5 rounded-full border border-gold-500/40 text-gold-400 bg-gold-500/5"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          {props.monthly.footnote && (
            <div className="mt-auto pt-5 text-[13px] italic text-navy-200">{props.monthly.footnote}</div>
          )}
        </motion.div>

        {/* RIGHT — The Big Event */}
        <motion.div
          variants={fadeUp}
          className="relative rounded-2xl p-7 flex flex-col overflow-hidden border border-gold-500/60"
          style={{
            background: 'linear-gradient(160deg,#1a2e54 0%,#0a1730 55%,#3a2a14 100%)',
            boxShadow: '0 30px 60px -20px rgba(196,149,61,0.45)',
          }}
        >
          <div className="absolute top-4 right-4 text-[10px] tracking-[0.3em] text-navy-950 bg-gold-500 px-3 py-1 rounded-full">
            PHARE
          </div>

          {props.bigEvent.kicker && (
            <div className="text-[12px] tracking-[0.3em] uppercase text-gold-400">
              {props.bigEvent.kicker}
            </div>
          )}
          <div className="mt-2 h-display text-[32px] leading-tight text-white">{props.bigEvent.heading}</div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {props.bigEvent.facts.map((f) => (
              <div key={f.label} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="h-display text-[28px] leading-none text-gold-500">{f.value}</div>
                <div className="mt-1 text-[11px] uppercase tracking-widest text-white/70">{f.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <div className="text-[12px] tracking-[0.3em] uppercase text-gold-400">3 Parcours</div>
            <ul className="mt-3 space-y-2.5">
              {props.bigEvent.tracks.map((t) => (
                <li
                  key={t}
                  className="text-[19px] font-medium text-white flex gap-3 leading-snug rounded-lg bg-white/[0.06] border border-white/10 px-4 py-2.5"
                >
                  <span className="text-gold-500 flex-none mt-0.5 text-[22px]">▸</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {props.bigEvent.guest && (
            <div className="mt-auto pt-5 text-[13px] text-white/85">
              <span className="text-gold-400 uppercase tracking-widest text-[11px] mr-2">Guest</span>
              {props.bigEvent.guest}
            </div>
          )}

          <span className="absolute -right-16 -bottom-16 w-56 h-56 rounded-full bg-gold-500/15 blur-2xl pointer-events-none" />
        </motion.div>
      </motion.div>
    </div>
  )
}
