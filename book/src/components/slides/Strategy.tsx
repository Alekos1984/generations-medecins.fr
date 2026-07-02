import { motion } from 'framer-motion'
import type { StrategyProps } from '../../lib/types'
import { fadeUp, stagger, VIEWPORT_ONCE } from './_anim'

export default function Strategy(props: StrategyProps) {
  const cols = props.axes.length >= 7 ? 4 : props.axes.length >= 5 ? 4 : 3
  return (
    <div className="h-full w-full flex flex-col">
      <div className="eyebrow">{props.eyebrow ?? '02 • Axes de réflexion'}</div>
      <h2 className="h-display text-[50px] leading-tight mt-3 text-white">{props.title}</h2>
      <div className="gold-bar mt-3" />
      {props.subtitle && (
        <p className="mt-3 text-[16px] text-navy-200 max-w-[1100px] leading-snug">{props.subtitle}</p>
      )}

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
        variants={stagger}
        className="mt-6 grid gap-3 flex-1 min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {props.axes.map((a, i) => (
          <motion.div
            key={a.title}
            custom={i}
            variants={fadeUp}
            className="group relative rounded-xl bg-white/[0.04] border border-white/5 p-4 flex flex-col hover:bg-white/[0.07] transition"
          >
            <div className="text-[11px] tracking-[0.3em] uppercase text-gold-500">{a.num}</div>
            <div className="mt-1.5 text-[16px] font-semibold text-white leading-tight">{a.title}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {a.tags.map((t) => (
                <span
                  key={t}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-white/10 bg-white/[0.03] text-navy-100 leading-tight"
                >
                  {t}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>

      {props.propositions && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="mt-4 rounded-2xl bg-gold-500/10 border border-gold-500/50 px-5 py-4"
        >
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div className="text-[12px] tracking-[0.3em] uppercase text-gold-500">
              {props.propositions.title ?? 'Trois propositions prêtes à défendre'}
            </div>
            {props.propositions.intro && (
              <div className="text-[12px] italic text-navy-100 max-w-[720px]">
                {props.propositions.intro}
              </div>
            )}
          </div>
          <ul className="mt-3 grid grid-cols-3 gap-3">
            {props.propositions.items.map((p, i) => (
              <li
                key={i}
                className="rounded-xl bg-navy-900/40 border border-white/5 px-4 py-3 flex items-start gap-3"
              >
                <span
                  className="flex-none w-7 h-7 rounded-full grid place-items-center text-navy-950 text-[13px] font-bold"
                  style={{ background: 'linear-gradient(135deg,#c4953d,#d6ad58)' }}
                >
                  {i + 1}
                </span>
                <span className="text-[14px] text-white/95 leading-snug">{p}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  )
}
