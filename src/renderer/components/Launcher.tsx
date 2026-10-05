import { motion } from 'motion/react'
import { Archive, BookOpen, FolderOpen, GitBranch, LayoutGrid, Pin, PinOff, Search, Server, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { HostEntry } from '@shared/types'
import { orch } from '../lib/orch'
import { cx, fuzzy, hashColor, tildify, timeAgo } from '../lib/util'
import { openHost } from '../lib/tiles'
import { useApp } from '../store/app'
import { Button, IconButton } from './ui'

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
  const { recents, projects, sessions, pages, openProject, set, settings } = useApp()
  const [q, setQ] = useState('')
  const [hosts, setHosts] = useState<HostEntry[]>([])
  useEffect(() => {
    orch.invoke('hosts:list').then(setHosts)
  }, [settings.hosts])

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
      className="orch-screen absolute inset-0 z-20 overflow-y-auto scroll-thin bg-[color-mix(in_oklab,var(--app-bg)_88%,transparent)] backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="drag h-12" />
      <div className="mx-auto max-w-5xl px-10 pb-24">
        <div className="mt-2 mb-6 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-white">Projects</h1>
            <p className="mt-1 text-[13px] text-white/50">
              Each session runs <code className="font-mono text-[12px] text-white/70">claude</code> in its own worktree and ports, and the sessions share a message bus.
            </p>
          </div>
          <button
            onClick={() => set({ helpOpen: true })}
            className="no-drag inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <BookOpen size={13} /> Guide <kbd>⌘/</kbd>
          </button>
        </div>

        <div className="mb-8 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-white/35" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && cards[0] && openProject(cards[0].path)}
              placeholder="Search recent projects…"
              className="no-drag h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pr-4 pl-10 text-[13.5px] text-white placeholder-white/35 outline-none transition-colors focus:border-violet-400/50"
            />
          </div>
          <Button tone="soft" onClick={pick} className="h-10 rounded-xl px-4">
            <FolderOpen size={15} /> Open folder…
          </Button>
          {pages.length > 0 && (
            <Button tone="primary" onClick={() => set({ view: 'workspace' })} className="h-10 rounded-xl px-4">
              <LayoutGrid size={15} /> Back to workspace
            </Button>
          )}
        </div>

        <Section title="Pinned" cards={pinned} offset={0} />
        <Section title="Running now" cards={active} offset={pinned.length} />
        <Hosts hosts={hosts.filter((h) => fuzzy(q, `${h.name} ${h.target ?? ''}`) > 0)} />
        <Section title="Recent" cards={rest} offset={pinned.length + active.length} />
        {!cards.length && <div className="py-20 text-center text-white/40">No projects match “{q}”.</div>}
      </div>
    </motion.div>
  )
}

function Hosts({ hosts }: { hosts: HostEntry[] }) {
  const { set } = useApp()
  return (
    <div className="mb-10">
      <div className="mb-2.5 flex items-center gap-2 text-[12.5px] font-medium text-white/50">
        Hosts
        <button onClick={() => set({ settingsOpen: true })} className="no-drag rounded-md px-1.5 py-0.5 text-[12px] text-white/40 hover:bg-white/[0.06] hover:text-white/70">
          {hosts.length ? 'Add or edit…' : 'Add a host…'}
        </button>
      </div>
      {hosts.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
          {hosts.map((h) => (
            <div key={h.name} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[var(--tile-bg)] px-3.5 py-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-white/60">
                <Server size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold text-white/90">{h.name}</div>
                <div className="truncate font-mono text-[10.5px] text-white/35">{h.target || (h.source === 'ssh-config' ? 'ssh config' : h.name)}</div>
              </div>
              <IconButton title="Shell over ssh" onClick={() => openHost(h)}>
                <TerminalSquare size={14} />
              </IconButton>
              <IconButton title="Run Claude on the host" onClick={() => openHost(h, true)}>
                <Sparkles size={14} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Section({ title, cards, offset }: { title: string; cards: Card[]; offset: number }) {
  if (!cards.length) return null
  return (
    <div className="mb-10">
      <div className="mb-2.5 text-[12.5px] font-medium text-white/50">{title}</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2.5">
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
    // A div acting as the button: the pin and handoff controls inside it are real buttons, which can't nest in one.
    <motion.div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        openProject(card.path)
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.015, 0.2) }}
      onClick={() => openProject(card.path)}
      className="group no-drag cursor-default rounded-xl border border-white/[0.08] bg-[var(--tile-bg)] p-3.5 text-left transition-colors hover:border-white/[0.18] focus-visible:border-violet-400/60 focus-visible:outline-none"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[13px] font-semibold text-[rgba(0,0,0,0.75)]" style={{ background: card.color }}>
          {card.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium text-white">{card.name}</div>
          <div className="truncate font-mono text-[11px] text-white/35">{tildify(card.path, orch.homedir)}</div>
        </div>
        <button
          type="button"
          onClick={togglePin}
          aria-label={card.pinned ? `Unpin ${card.name}` : `Pin ${card.name}`}
          className={cx(
            'rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white focus-visible:opacity-100',
            card.pinned ? 'opacity-100' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
        >
          {card.pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] whitespace-nowrap text-white/45">
        {card.live > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {card.live} live
          </span>
        )}
        {card.isGit && (
          <span className="inline-flex items-center gap-1">
            <GitBranch size={11} /> git
          </span>
        )}
        {card.prompts ? <span>{card.prompts} prompts</span> : null}
        {saved > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              set({ newSession: { projectPath: card.path, mode: 'pickup' } })
            }}
            title="Pick up a saved handoff"
            className="inline-flex items-center gap-1 rounded-full bg-violet-400/12 px-2 py-0.5 text-violet-200 transition hover:bg-violet-400/25"
          >
            <Archive size={11} /> {saved} handoff{saved === 1 ? '' : 's'}
          </button>
        )}
        <span className="ml-auto">{timeAgo(card.lastUsed)}</span>
      </div>
    </motion.div>
  )
}
