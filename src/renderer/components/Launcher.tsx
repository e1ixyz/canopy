import { motion } from 'motion/react'
import { Archive, BookOpen, FolderOpen, GitBranch, LayoutGrid, Pin, PinOff, Search, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { orch } from '../lib/orch'
import { spring } from '../lib/motion'
import { cx, fuzzy, hashColor, tildify, timeAgo } from '../lib/util'
import { useApp } from '../store/app'
import { Button } from './ui'

interface Card {
  path: string
  name: string
  lastUsed: number
  prompts?: number
  isGit?: boolean
  pinned?: boolean
  projectId?: string
  color: string
  live: number
}

export function Launcher() {
  const { recents, projects, sessions, pages, openProject, set } = useApp()
  const [q, setQ] = useState('')

  const cards = useMemo(() => {
    const byPath = new Map<string, Card>()
    const liveBy = (pid?: string) => Object.values(sessions).filter((s) => s.projectId === pid && s.status !== 'exited').length
    for (const p of projects)
      byPath.set(p.path, { path: p.path, name: p.name, lastUsed: p.lastOpened, pinned: p.pinned, projectId: p.id, color: p.color, live: liveBy(p.id) })
    for (const r of recents) {
      const cur = byPath.get(r.path)
      if (cur) Object.assign(cur, { prompts: r.prompts, isGit: r.isGit, lastUsed: Math.max(cur.lastUsed, r.lastUsed) })
      else byPath.set(r.path, { path: r.path, name: r.name, lastUsed: r.lastUsed, prompts: r.prompts, isGit: r.isGit, color: hashColor(r.path), live: 0 })
    }
    return [...byPath.values()]
      .map((c) => ({ c, score: fuzzy(q, `${c.name} ${c.path}`) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => (q ? b.score - a.score : 0) || b.c.lastUsed - a.c.lastUsed)
      .map((x) => x.c)
  }, [recents, projects, sessions, q])

  const pinned = cards.filter((c) => c.pinned)
  const active = cards.filter((c) => !c.pinned && c.live > 0)
  const rest = cards.filter((c) => !c.pinned && c.live === 0)

  const pick = async () => {
    const p = await orch.invoke('dialog:openFolder')
    if (p) openProject(p)
  }

  return (
    <motion.div
      key="launcher"
      className="absolute inset-0 z-20 overflow-y-auto scroll-thin bg-[#07070c]/70 backdrop-blur-xl"
      initial={{ opacity: 0, scale: 1.03, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 0.97, filter: 'blur(10px)' }}
      transition={spring.gentle}
    >
      <div className="drag h-12" />
      <div className="mx-auto max-w-6xl px-10 pb-24">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring.gentle, delay: 0.05 }} className="mt-10 mb-10">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11.5px] text-white/60">
            <Sparkles size={12} className="text-violet-300" /> Claude Code, many at once
          </div>
          <h1 className="text-[56px] leading-[1.02] font-semibold tracking-[-0.035em]">
            <span className="bg-gradient-to-br from-white via-white to-violet-300/80 bg-clip-text text-transparent">Pick a project.</span>
            <br />
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-sky-300 bg-clip-text text-transparent">Run the whole team.</span>
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-white/50">
            Every session is the real <code className="rounded bg-white/5 px-1 font-mono text-[13px] text-white/70">claude</code> CLI, in its own worktree, on its own ports, talking to the others over a shared bus.
          </p>
          <button
            onClick={() => set({ helpOpen: true })}
            className="no-drag mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[12.5px] text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            <BookOpen size={13} /> New here? Read the guide <kbd>⌘/</kbd>
          </button>
        </motion.div>

        <div className="mb-8 flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-white/35" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cards[0] && openProject(cards[0].path)}
              placeholder="Search recent projects…"
              className="no-drag h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pr-4 pl-11 text-[14px] text-white placeholder-white/30 outline-none transition focus:border-violet-400/40 focus:bg-white/[0.06] focus:ring-4 focus:ring-violet-500/10"
            />
          </div>
          <Button tone="soft" onClick={pick} className="h-12 rounded-2xl px-5">
            <FolderOpen size={16} /> Open folder…
          </Button>
          {pages.length > 0 && (
            <Button tone="primary" onClick={() => set({ view: 'workspace' })} className="h-12 rounded-2xl px-5">
              <LayoutGrid size={16} /> Back to workspace
            </Button>
          )}
        </div>

        <Section title="Pinned" cards={pinned} offset={0} />
        <Section title="Running now" cards={active} offset={pinned.length} />
        <Section title="Recent" cards={rest} offset={pinned.length + active.length} />
        {!cards.length && <div className="py-20 text-center text-white/40">No projects match “{q}”.</div>}
      </div>
    </motion.div>
  )
}

function Section({ title, cards, offset }: { title: string; cards: Card[]; offset: number }) {
  if (!cards.length) return null
  return (
    <div className="mb-10">
      <div className="mb-3 text-[11px] font-semibold tracking-[0.14em] text-white/35 uppercase">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
        {cards.map((c, i) => (
          <ProjectCard key={c.path} card={c} index={offset + i} />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({ card, index }: { card: Card; index: number }) {
  const { openProject, projects, set, handoffCounts } = useApp()
  const saved = handoffCounts[card.path] ?? 0
  const togglePin = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const p = card.projectId ? projects.find((x) => x.id === card.projectId) : await orch.invoke('project:open', card.path)
    if (!p) return
    await orch.invoke('project:pin', p.id, !card.pinned)
    set({ projects: [...projects.filter((x) => x.id !== p.id), { ...p, pinned: !card.pinned }] })
  }
  return (
    <motion.button
      layoutId={`project-${card.path}`}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.bouncy, delay: Math.min(index * 0.025, 0.5) }}
      whileHover={{ y: -4, scale: 1.015 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => openProject(card.path)}
      className="group no-drag relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 text-left shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/[0.14] hover:bg-white/[0.06]"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-40"
        style={{ background: card.color }}
      />
      <div className="relative flex items-start gap-3">
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[15px] font-bold text-black/80 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in oklab, ${card.color} 55%, white))` }}
        >
          {card.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-white/95">{card.name}</div>
          <div className="truncate font-mono text-[11px] text-white/35">{tildify(card.path, orch.homedir)}</div>
        </div>
        <span
          onClick={togglePin}
          className={cx('rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white', card.pinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
        >
          {card.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </span>
      </div>
      <div className="relative mt-4 flex items-center gap-2 text-[11.5px] text-white/45">
        {card.live > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> {card.live} live
          </span>
        )}
        {card.isGit && (
          <span className="inline-flex items-center gap-1">
            <GitBranch size={11} /> git
          </span>
        )}
        {card.prompts ? <span>{card.prompts} prompts</span> : null}
        {saved > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation()
              set({ newSession: { projectPath: card.path, mode: 'pickup' } })
            }}
            title="Pick up a saved handoff"
            className="inline-flex items-center gap-1 rounded-full bg-violet-400/12 px-2 py-0.5 text-violet-200 transition hover:bg-violet-400/25"
          >
            <Archive size={11} /> {saved} handoff{saved === 1 ? '' : 's'}
          </span>
        )}
        <span className="ml-auto">{timeAgo(card.lastUsed)}</span>
      </div>
    </motion.button>
  )
}
