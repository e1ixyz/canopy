import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowRight,
  BookOpen,
  FolderOpen,
  GitFork,
  Globe,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  TerminalSquare,
  TextSearch,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { searchAll, submitPrompt } from '../lib/terms'
import { cx, fuzzy } from '../lib/util'
import { tileForSession, useApp } from '../store/app'
import { freshHandoff } from './TileChips'
import { Modal } from './ui'

interface Cmd {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  group: string
  run: () => void
}

export function CommandPalette() {
  const { paletteOpen, set } = useApp()
  return (
    <Modal open={paletteOpen} onClose={() => set({ paletteOpen: false })} width={640} align="top">
      {paletteOpen && <Body />}
    </Modal>
  )
}

function Body() {
  const st = useApp()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const close = () => st.set({ paletteOpen: false })
  const activePage = st.pages.find((p) => p.id === st.activePageId)
  const activeTile = activePage?.tiles.find((t) => t.id === st.activeTileId)
  const activeSession = activeTile ? st.sessions[activeTile.sessionId] : undefined
  const projectPath = st.projects.find((p) => p.id === activeSession?.projectId)?.path ?? st.projects[0]?.path

  const commands = useMemo<Cmd[]>(() => {
    const c: Cmd[] = [
      { id: 'new', group: 'Create', label: 'New Claude session', hint: '⌘T', icon: <Sparkles size={14} />, run: () => st.set({ newSession: { projectPath } }) },
      { id: 'new-wt', group: 'Create', label: 'New worktree + session', hint: '⌘⇧T', icon: <GitFork size={14} />, run: () => st.set({ newSession: { projectPath, mode: 'worktree' } }) },
      { id: 'shell', group: 'Create', label: 'New shell', icon: <TerminalSquare size={14} />, run: () => st.set({ newSession: { projectPath, kind: 'shell' } }) },
      { id: 'page', group: 'Create', label: 'New page', icon: <Plus size={14} />, run: () => st.addPage() },
      { id: 'open', group: 'Create', label: 'Open project…', hint: '⌘O', icon: <FolderOpen size={14} />, run: () => st.set({ view: 'launcher' }) },
      { id: 'bus', group: 'View', label: 'Toggle session bus', hint: '⌘B', icon: <MessagesSquare size={14} />, run: () => st.set({ busOpen: !st.busOpen }) },
      { id: 'overview', group: 'View', label: 'Overview of every session', hint: '⌘⇧O', icon: <LayoutDashboard size={14} />, run: () => st.set({ overviewOpen: true }) },
      { id: 'broadcast', group: 'View', label: 'Broadcast a prompt to selected tiles', icon: <Megaphone size={14} />, run: () => st.set({ broadcastOpen: true }) },
      { id: 'worktrees', group: 'View', label: 'Worktrees & ports', icon: <GitFork size={14} />, run: () => st.set({ worktreesOpen: true }) },
      { id: 'help', group: 'View', label: 'Guide: how Orchestrator works', hint: '⌘/', icon: <BookOpen size={14} />, run: () => st.set({ helpOpen: true }) },
      { id: 'settings', group: 'View', label: 'Settings', icon: <Settings2 size={14} />, run: () => st.set({ settingsOpen: true }) },
    ]
    if (activeTile && activeSession) {
      c.push(
        { id: 'goal', group: 'This tile', label: `Goal for ${activeSession.name}…`, icon: <Sparkles size={14} />, run: () => st.set({ goalFor: activeSession.id }) },
        { id: 'ship', group: 'This tile', label: `Ship from ${activeSession.name}…`, icon: <Play size={14} />, run: () => st.set({ shipFor: activeSession.id }) },
        { id: 'pr', group: 'This tile', label: 'Pull request panel', icon: <GitFork size={14} />, run: () => st.set({ prFor: activeTile.id }) },
        {
          id: 'shots',
          group: 'This tile',
          label: 'Screenshot set…',
          icon: <Globe size={14} />,
          run: () => {
            st.setPreview(activeTile.id, { open: true })
            setTimeout(() => st.set({ shotSet: { sessionId: activeSession.id, tileId: activeTile.id } }), 400)
          },
        },
        { id: 'fresh', group: 'This tile', label: 'Fresh session with handoff', icon: <Sparkles size={14} />, run: () => freshHandoff(activeSession) },
        { id: 'clear', group: 'This tile', label: 'Clear context (/clear)', icon: <TerminalSquare size={14} />, run: () => submitPrompt(activeSession.id, '/clear') },
        { id: 'preview', group: 'This tile', label: `Toggle preview for ${activeSession.name}`, hint: '⌘⇧P', icon: <Globe size={14} />, run: () => st.togglePreview(activeTile.id) },
        {
          id: 'dev',
          group: 'This tile',
          label: `Start dev server in ${activeSession.branch ?? 'this worktree'}`,
          icon: <Play size={14} />,
          run: () => orch.invoke('dev:start', activeSession.cwd, projectPath ?? activeSession.cwd).catch((e) => st.toast(String(e.message), 'error')),
        },
      )
    }
    for (const p of st.pages) c.push({ id: `page-${p.id}`, group: 'Pages', label: `Go to ${p.name}`, icon: <ArrowRight size={14} />, run: () => st.setActivePage(p.id) })
    for (const s of Object.values(st.sessions)) {
      if (!tileForSession(st.pages, s.id)) continue
      c.push({
        id: `s-${s.id}`,
        group: 'Sessions',
        label: `${s.name}`,
        hint: [s.branch, s.status, s.task].filter(Boolean).join(' · '),
        icon: <TerminalSquare size={14} />,
        run: () => st.jumpToSession(s.id),
      })
    }
    for (const r of st.recents.slice(0, 12))
      c.push({ id: `r-${r.path}`, group: 'Projects', label: r.name, hint: r.path, icon: <FolderOpen size={14} />, run: () => st.openProject(r.path) })
    return c
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.pages, st.sessions, st.recents, activeTile?.id, st.busOpen])

  const results = useMemo(() => {
    const scored = commands
      .map((c) => ({ c, s: fuzzy(q, `${c.label} ${c.hint ?? ''} ${c.group}`) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => (q ? b.s - a.s : 0))
      .map((x) => x.c)
    if (q.length >= 2) {
      for (const hit of searchAll(q, 12)) {
        const s = st.sessions[hit.sessionId]
        if (!s) continue
        scored.push({
          id: `find-${hit.sessionId}-${hit.row}`,
          group: 'In scrollback',
          label: hit.line.slice(0, 120),
          hint: s.name,
          icon: <TextSearch size={14} />,
          run: () => st.jumpToSession(hit.sessionId),
        })
      }
    }
    return scored.slice(0, 60)
  }, [commands, q, st])

  useEffect(() => {
    setIdx(0)
  }, [q])
  useEffect(() => {
    list.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  let lastGroup = ''
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5">
        <Search size={17} className="text-white/35" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setIdx((i) => Math.min(results.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setIdx((i) => Math.max(0, i - 1))
            } else if (e.key === 'Enter') {
              const r = results[idx]
              if (r) {
                close()
                r.run()
              }
            }
          }}
          placeholder="Run a command, jump to a session, search all scrollback…"
          className="h-14 flex-1 bg-transparent text-[15px] text-white placeholder-white/30 outline-none"
        />
        <kbd>esc</kbd>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto scroll-thin p-2">
        {results.map((r, i) => {
          const header = r.group !== lastGroup ? r.group : null
          lastGroup = r.group
          return (
            <div key={r.id}>
              {header && <div className="px-3 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.12em] text-white/30 uppercase">{header}</div>}
              <button
                data-idx={i}
                onMouseEnter={() => setIdx(i)}
                onClick={() => {
                  close()
                  r.run()
                }}
                className={cx('relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left', i === idx ? 'text-white' : 'text-white/70')}
              >
                {i === idx && <motion.span layoutId="palette-hl" transition={spring.snappy} className="absolute inset-0 rounded-xl bg-white/[0.08]" />}
                <span className="relative text-white/45">{r.icon}</span>
                <span className="relative min-w-0 flex-1 truncate text-[13px]">{r.label}</span>
                {r.hint && <span className="relative max-w-[40%] truncate text-[11px] text-white/35">{r.hint}</span>}
              </button>
            </div>
          )
        })}
        <AnimatePresence>{!results.length && <div className="py-10 text-center text-[13px] text-white/35">Nothing matches.</div>}</AnimatePresence>
      </div>
    </div>
  )
}
