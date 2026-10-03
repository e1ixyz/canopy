import { AnimatePresence, motion } from 'motion/react'
import { GitFork, Megaphone, Plus, TerminalSquare, Trees } from 'lucide-react'
import { spring } from '../lib/motion'
import { useActivePage, useApp } from '../store/app'

/** Floating action dock at the bottom of the workspace */
export function Dock() {
  const { set, sessions, projects, selected, clearSelection } = useApp()
  const page = useActivePage()
  const pageProject = page?.tiles.map((t) => sessions[t.sessionId]).find(Boolean)?.projectId
  const projectPath = projects.find((p) => p.id === pageProject)?.path ?? [...projects].sort((a, b) => b.lastOpened - a.lastOpened)[0]?.path

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
          ? 'no-drag flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-b from-violet-400 to-violet-600 px-4 text-[13px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(139,92,246,0.8),inset_0_1px_0_rgba(255,255,255,0.3)]'
          : 'no-drag flex h-10 items-center gap-2 rounded-2xl px-3.5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white'
      }
    >
      {icon}
      <span>{label}</span>
      {kbd && <kbd className={accent ? '!bg-white/15 !text-white/80' : ''}>{kbd}</kbd>}
    </motion.button>
  )

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...spring.bouncy, delay: 0.15 }}
      className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center"
    >
      <motion.div layout transition={spring.bouncy} className="glass pointer-events-auto flex items-center gap-1 rounded-[22px] p-1.5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9)]">
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
  )
}
