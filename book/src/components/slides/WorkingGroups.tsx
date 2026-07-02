import { motion } from 'framer-motion'
import type { WorkingGroupsProps } from '../../lib/types'
import { fadeUp, stagger, VIEWPORT_ONCE } from './_anim'

export default function WorkingGroups(props: WorkingGroupsProps) {
  const cols = props.groups.length > 4 ? 3 : 2
  return (
    <div className="h-full w-full flex flex-col">
      <div className="eyebrow">{props.eyebrow ?? '02 • Nos groupes de travail'}</div>
      <h2 className="h-display text-[54px] leading-tight mt-3 text-white">{props.title}</h2>
      <div className="gold-bar mt-3" />
      {props.subtitle && <p className="mt-3 text-[17px] text-navy-200 max-w-[1000px]">{props.subtitle}</p>}

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={VIEWPORT_ONCE}
        variants={stagger}
        className="mt-7 grid gap-4 flex-1 min-h-0"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {props.groups.map((g, i) => (
          <motion.div
            key={g.name}
            custom={i}
            variants={fadeUp}
            className="group relative rounded-2xl bg-white/[0.04] border border-white/5 p-5 hover:bg-white/[0.07] transition flex flex-col"
          >
            <div className="flex items-start gap-3">
              <div className="flex-none w-10 h-10 rounded-xl bg-gold-500/10 border border-gold-500/40 text-gold-500 flex items-center justify-center text-lg font-bold">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[17px] font-semibold text-white leading-tight">{g.name}</div>
                {g.theme && (
                  <div className="mt-1 text-[12px] uppercase tracking-widest text-gold-400">{g.theme}</div>
                )}
              </div>
            </div>

            {g.lead && (
              <div className="mt-auto pt-4 border-t border-white/5">
                <div className="text-[10px] tracking-[0.3em] uppercase text-accent-soft">Référent</div>
                <div className="mt-1 text-[13px] text-white/95 leading-tight">{g.lead}</div>
                {g.leadRole && (
                  <div className="text-[11px] text-navy-200">{g.leadRole}</div>
                )}
              </div>
            )}

            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-gold-500 to-transparent opacity-0 group-hover:opacity-100 transition" />
          </motion.div>
        ))}
      </motion.div>

      {props.footnote && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={VIEWPORT_ONCE}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="mt-5 rounded-2xl bg-gold-500/10 border border-gold-500/40 px-6 py-4 text-[15px] text-white leading-snug"
        >
          {props.footnote}
        </motion.div>
      )}
    </div>
  )
}
