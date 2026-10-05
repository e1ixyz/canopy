import { AnimatePresence, motion } from 'motion/react'
import { GitFork, Megaphone, Plus, TerminalSquare, Trees } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { spring } from '../lib/motion'
import { useActivePage, useApp } from '../store/app'

/** Floating action dock at the bottom of the workspace; tucked into a small tab until hovered */
export function Dock() {
  const { set, sessions, projects, selected, clearSelection } = useApp()
  const page = useActivePage()
  const pageProject = page?.tiles.map((t) => sessions[t.sessionId]).find(Boolean)?.projectId
  const projectPath = projects.find((p) => p.id === pageProject)?.path ?? [...projects].sort((a, b) => b.lastOpened - a.lastOpened)[0]?.path
  const [hover, setHover] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  // A pending broadcast keeps the dock out so the button stays reachable
  const open = hover || selected.length > 0
  const show = () => {
    window.clearTimeout(closeTimer.current)
    setHover(true)
  }
  const hide = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setHover(false), 280)
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const item = (icon: React.ReactNode, label: string, onClick: () => void, kbd?: string, accent?: boolean) => (
    <motion.button
      key={label}
      layout
      whileHover={{ y: -3, scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      transition={spring.bouncy}
      onClick={onClick}
      className={
        accent
          ? 'orch-key-primary no-drag flex h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 text-[13px] font-semibold text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]'
          : 'orch-key no-drag flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium text-white/75 transition-colors hover:bg-white/[0.08] hover:text-white'
      }
    >
      {icon}
      <span>{label}</span>
      {kbd && <kbd className={accent ? 'orch-kbd-accent' : undefined}>{kbd}</kbd>}
    </motion.button>
  )

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...spring.bouncy, delay: 0.15 }}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center"
    >
      <div
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && hide()}
        className="pointer-events-auto flex flex-col items-center"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.div
              key="dock"
              initial={{ y: 28, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 28, opacity: 0, scale: 0.9 }}
              transition={spring.bouncy}
              style={{ originY: 1 }}
              className="px-3 pt-3 pb-4"
            >
              <motion.div layout transition={spring.bouncy} className="orch-dock glass flex items-center gap-1 rounded-2xl p-1.5 shadow-[var(--pop-shadow)]">
                {item(<Plus size={15} />, 'Claude', () => set({ newSession: { projectPath } }), '⌘T', true)}
                {item(<GitFork size={15} />, 'Worktree', () => set({ newSession: { projectPath, mode: 'worktree' } }), '⌘⇧T')}
                {item(<TerminalSquare size={15} />, 'Shell', () => set({ newSession: { projectPath, kind: 'shell' } }))}
                {item(<Trees size={15} />, 'Worktrees', () => set({ worktreesOpen: true }))}
                <AnimatePresence>
                  {selected.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, width: 0, scale: 0.6 }}
                      animate={{ opacity: 1, width: 'auto', scale: 1 }}
                      exit={{ opacity: 0, width: 0, scale: 0.6 }}
                      transition={spring.bouncy}
                      className="flex items-center gap-1 overflow-hidden"
                    >
                      <div className="mx-1 h-6 w-px bg-white/10" />
                      {item(<Megaphone size={15} />, `Broadcast to ${selected.length}`, () => set({ broadcastOpen: true }))}
                      <button onClick={clearSelection} className="no-drag px-2 text-[11.5px] text-white/40 hover:text-white/80">
                        clear
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ) : (
            <motion.button
              key="tab"
              aria-label="Show dock"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              transition={spring.snappy}
              onClick={show}
              className="orch-dock-tab glass no-drag group grid h-[18px] w-20 place-items-center rounded-t-xl border-b-0"
            >
              <span className="h-[3px] w-7 rounded-full bg-white/25 transition-colors group-hover:bg-white/60" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
