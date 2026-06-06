import { motion } from 'framer-motion'
import type { CoverProps } from '../../lib/types'
import type { SlideContext } from './registry'

export default function Cover({ ctx, ...props }: CoverProps & { ctx: SlideContext }) {
  // Subtitle accepts a single string with optional \n for hard line breaks.
  const subtitleLines = (props.subtitle ?? '')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <div className="h-full w-full grid grid-cols-12 gap-10 items-stretch">
      {/* Decorative gold ring (top right) */}
      <div
        className="absolute top-[120px] right-[80px] w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(closest-side, rgba(196,149,61,0.18), transparent 70%)',
        }}
      />

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        className="col-span-7 flex flex-col"
      >
        <motion.div variants={lineVariant} className="eyebrow">
          {props.eyebrow ?? 'PARTENARIAT • 2026'}
        </motion.div>
        <motion.div
          variants={lineVariant}
          className="mt-4 text-[14px] tracking-[0.22em] text-navy-200 uppercase"
        >
          {props.brand ?? 'GÉNÉRATIONS MÉDECINS'}
        </motion.div>

        <div className="mt-8 space-y-1 flex-1">
          {props.titleLines.map((l, i) => (
            <motion.div
              key={i}
              variants={lineVariant}
              className="h-display text-[78px] leading-[0.95] text-white"
              style={i === 2 ? { color: '#d6ad58' } : undefined}
            >
              {l}
            </motion.div>
          ))}
        </div>

        {subtitleLines.length > 0 && (
          <motion.div
            variants={lineVariant}
            className="mt-6 max-w-[640px] space-y-1"
          >
            {subtitleLines.map((line, i) => (
              <p key={i} className="text-[18px] leading-relaxed text-navy-200">
                {line}
              </p>
            ))}
          </motion.div>
        )}

        {/* Bottom strip: GM logo on the left, "BOOK PARTENAIRES" on the right */}
        <motion.div variants={lineVariant} className="mt-10 flex items-end justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-[88px] h-[88px] rounded-2xl bg-white p-2 grid place-items-center shadow-glow ring-1 ring-gold-500/30">
              <img
                src="/gm-logo.jpeg"
                alt="Générations Médecins"
                className="max-w-full max-h-full object-contain"
                draggable={false}
              />
            </div>
            <div className="flex flex-col text-[12px] tracking-[0.2em] text-navy-200 uppercase leading-tight">
              <span>Générations</span>
              <span className="text-gold-500">Médecins</span>
            </div>
          </div>

          {props.footer && (
            <div className="inline-flex items-center gap-3 text-[12px] tracking-[0.3em] text-navy-300">
              <span className="inline-block w-10 h-px bg-gold-500" />
              {props.footer}
            </div>
          )}
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
        className="col-span-5 relative flex items-center justify-center"
      >
        <div className="relative w-[460px] h-[460px]">
          {/* Outer gold halo glow */}
          <div className="absolute -inset-4 rounded-full bg-gradient-to-br from-gold-500/30 via-accent/20 to-transparent blur-3xl" />
          {/* Gold ring */}
          <div className="absolute inset-0 rounded-full ring-2 ring-gold-500/40" />
          {/* WHITE inner disc — readable for both light and dark partner logos */}
          <div
            className="absolute inset-6 rounded-full bg-white"
            style={{
              boxShadow:
                '0 30px 80px -20px rgba(2,8,20,0.55), inset 0 0 0 1px rgba(196,149,61,0.25)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {ctx.partnerLogoUrl ? (
              <img
                src={ctx.partnerLogoUrl}
                alt={ctx.partnerName ?? ''}
                className="max-w-[58%] max-h-[58%] object-contain"
              />
            ) : (
              <div className="text-center">
                <div className="h-display text-[56px] text-navy-900">GM</div>
                <div className="mt-2 text-[12px] tracking-[0.3em] text-gold-600">IDF</div>
              </div>
            )}
          </div>
          {/* orbiting dot */}
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gold-500 shadow-[0_0_18px_4px_rgba(196,149,61,0.6)]" />
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

const lineVariant = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.7, 0.2, 1] } },
}
