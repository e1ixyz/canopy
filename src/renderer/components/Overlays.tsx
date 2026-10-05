import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { AlertCircle, CheckCircle2, Download, GitFork, Info, Loader2, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx, hashColor } from '../lib/util'
import { useApp, type Packet } from '../store/app'
import { Button } from './ui'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const icon = { info: <Info size={14} />, ok: <CheckCircle2 size={14} />, warn: <TriangleAlert size={14} />, error: <AlertCircle size={14} /> }
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={spring.bouncy}
            className={cx(
              'glass pointer-events-auto flex max-w-[560px] items-center gap-2 rounded-2xl px-4 py-2.5 text-[12.5px] shadow-2xl',
              t.tone === 'ok' && 'text-emerald-200',
              t.tone === 'warn' && 'text-amber-200',
              t.tone === 'error' && 'text-rose-200',
              t.tone === 'info' && 'text-white/80',
            )}
          >
            {icon[t.tone]}
            <span className="select-text">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** Sessions asking to start other sessions (spawn_session / handoff) need a human yes */
export function SpawnConfirms() {
  const { confirms, set } = useApp()
  const answer = (requestId: string, ok: boolean) => {
    orch.invoke('spawn:confirm', requestId, ok)
    set({ confirms: useApp.getState().confirms.filter((c) => c.requestId !== requestId) })
  }
  return (
    <div className="fixed top-16 right-4 z-[55] flex w-[380px] flex-col gap-3">
      <AnimatePresence>
        {confirms.map((c) => (
          <motion.div
            key={c.requestId}
            layout
            initial={{ opacity: 0, x: 80, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.9 }}
            transition={spring.bouncy}
            className="glass rounded-2xl p-4 shadow-[var(--pop-shadow)]"
          >
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
              <Sparkles size={14} className="text-violet-300" />
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: hashColor(c.by) }} />
                {c.by}
              </span>
              wants a new session
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5 text-[11px]">
              {c.req.role && <span className="rounded-md bg-sky-400/15 px-1.5 py-0.5 text-sky-200">{c.req.role}</span>}
              {c.req.name && <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-white/70">{c.req.name}</span>}
              <span className="flex items-center gap-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-white/70">
                <GitFork size={10} /> {c.req.worktree === 'new' ? `new worktree${c.req.branch ? ` ${c.req.branch}` : ''}` : c.req.worktree === 'same' ? 'same checkout' : c.req.worktree}
              </span>
            </div>
            <div className="mb-3 line-clamp-5 rounded-xl bg-black/30 p-2.5 text-[12px] leading-relaxed whitespace-pre-wrap text-white/70">{c.req.prompt}</div>
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => answer(c.requestId, false)}>
                Decline
              </Button>
              <Button size="sm" tone="primary" onClick={() => answer(c.requestId, true)}>
                Start it
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** GitHub has commits the running build doesn't: offer to pull, build and restart */
export function UpdateCard() {
  const { update, updateDismissed, set } = useApp()
  if (!update?.enabled) return null
  const { phase } = update
  const hidden = phase === 'idle' || ((phase === 'available' || phase === 'ready') && updateDismissed === update.latest)
  const later = () => set({ updateDismissed: update.latest ?? null })
  return (
    <AnimatePresence>
      {!hidden && (
        <motion.div
          key="update"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.18 }}
          className="glass fixed right-4 bottom-4 z-[55] w-[340px] rounded-2xl p-4 shadow-[var(--pop-shadow)]"
          role="status"
        >
          {phase === 'available' && (
            <>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Download size={14} className="text-violet-300" /> Update available
              </div>
              <div className="mt-1 text-[12px] text-white/55">
                {update.behind} new commit{update.behind === 1 ? '' : 's'} on GitHub
              </div>
              {!!update.commits?.length && (
                <ul className="mt-2.5 max-h-[132px] space-y-1 overflow-y-auto scroll-thin rounded-xl bg-black/25 p-2.5 text-[12px]">
                  {update.commits.map((c) => (
                    <li key={c.sha} className="flex gap-2">
                      <span className="shrink-0 font-mono text-[11px] text-white/35">{c.sha}</span>
                      <span className="min-w-0 truncate text-white/75">{c.subject}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" onClick={later}>
                  Later
                </Button>
                <Button size="sm" tone="primary" onClick={() => orch.invoke('update:prepare')}>
                  Update
                </Button>
              </div>
            </>
          )}
          {phase === 'building' && (
            <div className="flex items-center gap-2.5 text-[12.5px]">
              <Loader2 size={14} className="animate-spin text-violet-300" />
              <div>
                <div className="font-semibold">Updating Canopy</div>
                <div className="text-white/55">{update.step}…</div>
              </div>
            </div>
          )}
          {phase === 'ready' && (
            <>
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <CheckCircle2 size={14} className="text-emerald-300" /> Update ready
              </div>
              <div className="mt-1 text-[12px] leading-relaxed text-white/55">
                Restart to finish. Sessions come back with their conversations; a turn that is still running stops.
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" onClick={later}>
                  Later
                </Button>
                <Button size="sm" tone="primary" onClick={() => orch.invoke('update:install')}>
                  Restart now
                </Button>
              </div>
            </>
          )}
          {phase === 'error' && (
            <>
              <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-200">
                <AlertCircle size={14} /> Update failed
              </div>
              <div className="mt-1 text-[12px] leading-relaxed break-words text-white/60 select-text">{update.error}</div>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" onClick={() => orch.invoke('update:dismissError')}>
                  Dismiss
                </Button>
                {!!update.behind && (
                  <Button size="sm" tone="primary" onClick={() => orch.invoke('update:prepare')}>
                    Try again
                  </Button>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** A glowing dot that flies from the sender's tile to the receiver's when they talk */
export function Packets() {
  const packets = useApp((s) => s.packets)
  return (
    <div className="pointer-events-none fixed inset-0 z-[45]">
      {packets.map((p) => (
        <PacketDot key={p.id} p={p} />
      ))}
    </div>
  )
}

function center(id: string) {
  const sel = id === 'user' ? '[data-bus-anchor]' : `[data-session="${id}"]`
  const el = document.querySelector(sel) as HTMLElement | null
  if (!el || el.offsetParent === null) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0) return null
  return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60) }
}

function PacketDot({ p }: { p: Packet }) {
  const [scope, animate] = useAnimate()
  useEffect(() => {
    const a = center(p.from) ?? center('user')
    const b = center(p.to)
    const done = () => useApp.setState((s) => ({ packets: s.packets.filter((x) => x.id !== p.id) }))
    if (!a || !b || !scope.current) return done()
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 120 }
    animate(
      scope.current,
      { x: [a.x, mid.x, b.x], y: [a.y, mid.y, b.y], scale: [0.4, 1.4, 0.6], opacity: [0, 1, 0] },
      { duration: 1.1, ease: [0.45, 0, 0.2, 1] },
    ).then(done)
  }, [p, animate, scope])
  const color = p.kind === 'handoff' ? 'var(--color-fuchsia-400)' : p.kind === 'broadcast' ? 'var(--color-amber-400)' : 'var(--color-indigo-400)'
  return (
    <div
      ref={scope}
      className="absolute top-0 left-0 -mt-2 -ml-2 h-4 w-4 rounded-full"
      style={{ background: color, boxShadow: `0 0 16px 6px ${color}, 0 0 50px 10px color-mix(in oklab, ${color} 40%, transparent)`, opacity: 0 }}
    />
  )
}
