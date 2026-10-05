import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { Session } from '@shared/types'
import { sheet, spring } from '../lib/motion'
import { cx } from '../lib/util'

export function Button({
  children,
  onClick,
  tone = 'ghost',
  size = 'md',
  disabled,
  className,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  tone?: 'primary' | 'ghost' | 'danger' | 'soft'
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  return (
    <motion.button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { scale: 1.035, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      transition={spring.bouncy}
      className={cx(
        'no-drag inline-flex items-center justify-center gap-1.5 rounded-xl font-medium whitespace-nowrap transition-colors disabled:opacity-40',
        size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]',
        tone === 'primary' && 'orch-btn-primary bg-violet-500 text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-violet-600',
        tone === 'ghost' && 'text-white/70 hover:bg-white/[0.07] hover:text-white',
        tone === 'soft' && 'orch-btn-soft bg-white/[0.06] text-white/85 hover:bg-white/[0.1] border border-white/[0.06]',
        tone === 'danger' && 'bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-400/20',
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

export function IconButton({
  children,
  onClick,
  title,
  active,
  className,
  badge,
}: {
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
  title?: string
  active?: boolean
  className?: string
  badge?: number | string | null
}) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(e)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      transition={spring.bouncy}
      className={cx(
        'no-drag relative grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors',
        active ? 'bg-violet-500/20 text-violet-200' : 'text-white/55 hover:bg-white/[0.08] hover:text-white',
        className,
      )}
    >
      {children}
      <AnimatePresence>
        {badge ? (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring.bouncy}
            className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold text-knob shadow-lg"
          >
            {badge}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  )
}

export function Modal({
  open,
  onClose,
  children,
  width = 620,
  align = 'center',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
  align?: 'center' | 'top'
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    // Capture phase: a focused terminal would otherwise eat Escape (xterm stops its propagation).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, onClose])
  useEffect(() => {
    if (!open) return
    // Take focus from whatever sat behind the sheet (often a terminal), and give it back on close.
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => {
      if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true })
    }, 0)
    return () => {
      clearTimeout(t)
      if (prev?.isConnected) prev.focus({ preventScroll: true })
    }
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={cx('fixed inset-0 z-50 flex justify-center px-6', align === 'top' ? 'items-start pt-[12vh]' : 'items-center')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <div className="absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]" onClick={onClose} />
          <motion.div
            {...sheet}
            transition={spring.bouncy}
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            style={{ width, maxWidth: '100%' }}
            className="glass relative max-h-[82vh] overflow-hidden rounded-3xl shadow-[var(--pop-shadow)] outline-none"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  id: string
}) {
  return (
    <div className="no-drag inline-flex rounded-xl bg-white/[0.05] p-1 border border-white/[0.05]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'relative rounded-lg px-3 py-1 text-[12px] font-medium transition-colors',
            value === o.value ? 'text-white' : 'text-white/50 hover:text-white/80',
          )}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-lg bg-white/[0.1] shadow-inner" />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

const STATUS: Record<Session['status'], { label: string; dot: string; text: string }> = {
  starting: { label: 'starting', dot: 'bg-sky-400', text: 'text-sky-300' },
  idle: { label: 'idle', dot: 'bg-emerald-400', text: 'text-emerald-300' },
  working: { label: 'working', dot: 'bg-violet-400', text: 'text-violet-200' },
  waiting: { label: 'needs you', dot: 'bg-amber-400', text: 'text-amber-200' },
  exited: { label: 'exited', dot: 'bg-white/30', text: 'text-white/40' },
  error: { label: 'crashed', dot: 'bg-rose-400', text: 'text-rose-300' },
}

export function StatusPill({ status, compact }: { status: Session['status']; compact?: boolean }) {
  const s = STATUS[status]
  return (
    <motion.span
      layout
      transition={spring.snappy}
      className={cx(
        'orch-pill relative inline-flex h-5 shrink-0 items-center gap-1.5 overflow-hidden rounded-full px-2 text-[10.5px] font-semibold tracking-wide whitespace-nowrap uppercase',
        'bg-white/[0.05]',
        s.text,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {(status === 'working' || status === 'waiting' || status === 'starting') && (
          <span className={cx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-70', s.dot)} />
        )}
        <span className={cx('orch-led relative inline-flex h-1.5 w-1.5 rounded-full', s.dot)} />
      </span>
      {!compact && (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={status}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={spring.snappy}
          >
            {s.label}
          </motion.span>
        </AnimatePresence>
      )}
      {status === 'working' && <span className="shimmer pointer-events-none absolute inset-0 opacity-30" />}
    </motion.span>
  )
}

export function Ring({ pct, size = 18 }: { pct: number; size?: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  const color = pct > 85 ? 'var(--color-rose-400)' : pct > 65 ? 'var(--color-amber-400)' : 'var(--color-violet-400)'
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--hairline-strong)" strokeWidth={2.2} fill="none" />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={2.2}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        animate={{ strokeDashoffset: c * (1 - pct / 100) }}
        transition={spring.gentle}
      />
    </svg>
  )
}

/** A small floating panel anchored under its trigger; closes on outside click or Escape */
export function Popover({
  open,
  onClose,
  children,
  align = 'right',
  width = 320,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  align?: 'left' | 'right'
  width?: number
}) {
  const pop = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // The trigger shares the popover's wrapper and toggles it itself; closing here too would reopen it.
    const onDown = (e: MouseEvent) => {
      const wrap = pop.current?.parentElement
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -4 }}
          transition={spring.bouncy}
          ref={pop}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ width, transformOrigin: align === 'right' ? 'top right' : 'top left' }}
          className={cx('glass no-drag absolute top-9 z-50 rounded-2xl p-2 shadow-[var(--pop-shadow)]', align === 'right' ? 'right-0' : 'left-0')}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function fmtTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k`
  return String(n)
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold tracking-wider text-white/45 uppercase">
        <span>{label}</span>
        {hint}
      </div>
      {children}
    </label>
  )
}

export const inputCls =
  'no-drag w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-[13px] text-white placeholder-white/30 outline-none transition focus:border-violet-400/50 focus:bg-black/35 focus:ring-4 focus:ring-violet-500/10'

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="no-drag flex items-center gap-2.5 text-left text-[13px] text-white/80">
      <span className={cx('relative h-5 w-9 shrink-0 rounded-full transition-colors', on ? 'bg-violet-500' : 'bg-white/15')}>
        <motion.span
          animate={{ x: on ? 16 : 0 }}
          transition={spring.bouncy}
          className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-knob shadow"
        />
      </span>
      {label}
    </button>
  )
}
