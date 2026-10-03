import { AnimatePresence, motion } from 'motion/react'
import { Check, ExternalLink, FileDown, History, Pencil, Play, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { HandoffMeta } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx, tildify, timeAgo } from '../lib/util'
import { useApp } from '../store/app'
import { Toggle } from './ui'

/** The project's saved handoffs: pick one up in a fresh session, or resume the conversation it came from */
export function HandoffList({ projectPath, onPicked }: { projectPath: string; onPicked: () => void }) {
  const { handoffsRev, toast, addTile, jumpToSession, pages } = useApp()
  const [items, setItems] = useState<HandoffMeta[] | null>(null)
  const [showUsed, setShowUsed] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    orch.invoke('handoffs:list', projectPath).then(setItems)
  }, [projectPath, handoffsRev])

  const shown = (items ?? []).filter((h) => showUsed || !h.used)
  const used = (items ?? []).filter((h) => h.used).length

  const pick = async (h: HandoffMeta, original: boolean) => {
    setBusy(h.file)
    try {
      const s = await orch.invoke('handoffs:pickUp', h.file, original)
      useApp.setState((st) => ({ sessions: { ...st.sessions, [s.id]: s } }))
      if (pages.some((p) => p.tiles.some((t) => t.sessionId === s.id))) jumpToSession(s.id)
      else addTile(s.id)
      onPicked()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const rename = async (h: HandoffMeta) => {
    await orch.invoke('handoffs:rename', h.file, title)
    setRenaming(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 text-[11.5px] text-white/40">Saved from a tile’s menu or its context ring. Picking one up starts a fresh session where the work lives.</div>
        <button
          type="button"
          onClick={() => orch.invoke('handoffs:import', projectPath).then((h) => h && toast(`Imported “${h.title}”`, 'ok'))}
          className="no-drag flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] text-white/55 hover:bg-white/[0.06] hover:text-white"
        >
          <FileDown size={12} /> Import file…
        </button>
      </div>
      <div className="grid max-h-72 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto scroll-thin">
        <AnimatePresence initial={false}>
          {shown.map((h) => (
            <motion.div
              key={h.file}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.snappy}
              className={cx('group rounded-xl border border-white/[0.05] px-3 py-2', h.used ? 'bg-transparent opacity-60' : 'bg-white/[0.02]')}
            >
              <div className="flex items-center gap-2">
                {renaming === h.file ? (
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') rename(h)
                      if (e.key === 'Escape') setRenaming(null)
                      e.stopPropagation()
                    }}
                    onBlur={() => rename(h)}
                    className="no-drag min-w-0 flex-1 rounded-md bg-black/30 px-1.5 py-0.5 text-[12.5px] text-white outline-none ring-1 ring-violet-400/40"
                  />
                ) : (
                  <div className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{h.title}</div>
                )}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <RowButton title="Rename" onClick={() => (setRenaming(h.file), setTitle(h.title))}>
                    <Pencil size={12} />
                  </RowButton>
                  <RowButton title="Open in editor" onClick={() => orch.invoke('handoffs:open', h.file)}>
                    <ExternalLink size={12} />
                  </RowButton>
                  <RowButton title="Delete" danger onClick={() => orch.invoke('handoffs:remove', h.file)}>
                    <Trash2 size={12} />
                  </RowButton>
                </div>
              </div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] whitespace-nowrap text-white/35">
                <span className="shrink-0">{timeAgo(h.created)}</span>
                {h.session && <span className="shrink-0">{h.session}</span>}
                {h.branch && <span className="max-w-[40%] shrink-0 truncate text-violet-200/60">{h.branch}</span>}
                <span className="min-w-0 truncate">{tildify(h.cwd, orch.homedir)}</span>
                {h.used && (
                  <span className="flex items-center gap-1 text-emerald-300/60">
                    <Check size={10} /> picked up
                  </span>
                )}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => pick(h, false)}
                  className="no-drag flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-2.5 py-1 text-[11.5px] text-violet-100 transition hover:bg-violet-500/30 disabled:opacity-50"
                >
                  <Play size={11} /> {busy === h.file ? 'Starting…' : 'Pick up'}
                </button>
                {h.resumable && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => pick(h, true)}
                    title="Resume the full conversation instead of starting clean"
                    className="no-drag flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
                  >
                    <History size={11} /> Resume original conversation
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items && !shown.length && (
          <div className="py-6 text-center text-[12.5px] text-white/40">{used ? 'Every saved handoff has been picked up.' : 'No saved handoffs for this project yet.'}</div>
        )}
      </div>
      {used > 0 && <Toggle on={showUsed} onChange={setShowUsed} label={`Show ${used} picked up`} />}
    </div>
  )
}

function RowButton({ title, onClick, danger, children }: { title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cx('no-drag rounded-md p-1 text-white/45 transition', danger ? 'hover:bg-rose-500/15 hover:text-rose-200' : 'hover:bg-white/10 hover:text-white')}
    >
      {children}
    </button>
  )
}
