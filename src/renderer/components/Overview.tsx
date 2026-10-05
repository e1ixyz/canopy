import { AnimatePresence, motion } from 'motion/react'
import { GitBranch, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { spring } from '../lib/motion'
import { snapshot } from '../lib/terms'
import { useApp } from '../store/app'
import { IconButton, Ring, StatusPill } from './ui'

/** Mission control: every session on every page, with live terminal thumbnails */
export function Overview() {
  const { overviewOpen, set, pages, sessions, projects, jumpToSession } = useApp()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!overviewOpen) return
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set({ overviewOpen: false })
    // Capture phase, and out of the terminal: a focused xterm would swallow Escape and the keys typed next.
    window.addEventListener('keydown', onKey, true)
    if (document.activeElement?.closest('.xterm')) (document.activeElement as HTMLElement).blur()
    return () => {
      clearInterval(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [overviewOpen, set])

  return (
    <AnimatePresence>
      {overviewOpen && (
        <motion.div
          className="orch-screen fixed inset-0 z-50 overflow-y-auto scroll-thin bg-[color-mix(in_oklab,var(--app-bg)_92%,transparent)] backdrop-blur-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="drag h-12" />
          <div className="mx-auto max-w-[1500px] px-10 pb-16">
            <div className="mb-8 flex items-center">
              <div className="flex-1">
                <div className="text-[26px] font-semibold tracking-tight">Overview</div>
                <div className="text-[13px] text-white/45">
                  {Object.values(sessions).filter((s) => s.status === 'working').length} working ·{' '}
                  {Object.values(sessions).filter((s) => s.status === 'waiting').length} waiting on you ·{' '}
                  {Object.values(sessions).length} total
                </div>
              </div>
              <IconButton title="Close (esc)" onClick={() => set({ overviewOpen: false })}>
                <X size={16} />
              </IconButton>
            </div>
            {pages.map((p, pi) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring.gentle, delay: pi * 0.05 }}
                className="mb-10"
              >
                <div className="mb-3 text-[12px] font-semibold tracking-[0.14em] text-white/40 uppercase">{p.name}</div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                  {p.tiles.map((t, i) => {
                    const s = sessions[t.sessionId]
                    if (!s) return null
                    const proj = projects.find((x) => x.id === s.projectId)
                    const lines = snapshot(s.id, 12)
                    return (
                      <motion.button
                        key={t.id + tick * 0}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ ...spring.bouncy, delay: pi * 0.05 + i * 0.03 }}
                        whileHover={{ y: -5, scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => jumpToSession(s.id)}
                        className="no-drag group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] text-left"
                        style={{ boxShadow: s.status === 'waiting' ? '0 0 0 1px color-mix(in oklab, var(--color-amber-400) 60%, transparent), 0 0 32px -10px color-mix(in oklab, var(--color-amber-400) 50%, transparent)' : undefined }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${proj?.color ?? '#a78bfa'}, transparent)` }} />
                        <div className="flex items-center gap-2 px-3.5 pt-3">
                          <span className="text-[13.5px] font-semibold">{s.name}</span>
                          <StatusPill status={s.status} />
                          <span className="flex-1" />
                          {s.contextPct !== undefined && <Ring pct={s.contextPct} />}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 overflow-hidden px-3.5 text-[11.5px] whitespace-nowrap text-white/45">
                          <span className="max-w-[40%] shrink-0 truncate">{proj?.name}</span>
                          <GitBranch size={10} className="shrink-0" />
                          <span className="max-w-[40%] shrink-0 truncate font-mono">{s.branch}</span>
                          {s.ports.length > 0 && <span className="ml-auto min-w-0 truncate font-mono text-emerald-300/70">:{s.ports.join(' :')}</span>}
                        </div>
                        {s.task && <div className="mt-1.5 truncate px-3.5 text-[12px] text-violet-200/80">{s.task}</div>}
                        <pre className="mx-3 mt-2.5 mb-3 h-[150px] overflow-hidden rounded-xl bg-black/40 p-2.5 font-mono text-[9.5px] leading-[1.35] text-white/55">
                          {lines.join('\n') || ' '}
                        </pre>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
