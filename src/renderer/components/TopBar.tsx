import { AnimatePresence, motion } from 'motion/react'
import { Bell, CircleHelp, Command, Home, LayoutDashboard, MessagesSquare, Plus, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import type { Page } from '@shared/types'
import { spring } from '../lib/motion'
import { cx } from '../lib/util'
import { useApp } from '../store/app'
import { PortsPopover } from './PortsPopover'
import { IconButton } from './ui'
import { UsageMeter } from './UsageMeter'

export function TopBar() {
  const { pages, activePageId, setActivePage, addPage, set, busOpen, userUnread, sessions, jumpToSession, view } = useApp()
  const attention = Object.values(sessions).filter((s) => s.status === 'waiting' || (s.attention && s.status === 'idle'))
  const waiting = attention.filter((s) => s.status === 'waiting')

  const nextAttention = () => {
    const s = waiting[0] ?? attention[0]
    if (s) jumpToSession(s.id)
  }

  return (
    <div className="drag relative z-30 flex h-12 shrink-0 items-center gap-2 pr-3 pl-[86px]">
      <IconButton title="Projects (⌘O)" onClick={() => set({ view: 'launcher' })} active={view === 'launcher'}>
        <Home size={15} />
      </IconButton>
      <div className="mx-1 h-5 w-px bg-white/10" />
      <div className="no-drag flex min-w-0 items-center gap-1 overflow-x-auto scroll-thin">
        <AnimatePresence initial={false}>
          {pages.map((p) => (
            <PageTab key={p.id} page={p} active={p.id === activePageId && view === 'workspace'} onClick={() => setActivePage(p.id)} />
          ))}
        </AnimatePresence>
        <IconButton title="New page" onClick={() => addPage()}>
          <Plus size={15} />
        </IconButton>
      </div>
      <div className="flex-1" />
      <AnimatePresence>
        {attention.length > 0 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={spring.bouncy}
            onClick={nextAttention}
            title="Jump to the next session that needs you (⌘J)"
            className={cx(
              'no-drag flex h-7 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium',
              waiting.length ? 'bg-amber-400/15 text-amber-200 ring-1 ring-amber-300/30' : 'bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/20',
            )}
          >
            <Bell size={13} className={waiting.length ? 'animate-[wiggle_1s_ease-in-out_infinite]' : ''} />
            {waiting.length ? `${waiting.length} need${waiting.length === 1 ? 's' : ''} you` : `${attention.length} finished`}
            <kbd>⌘J</kbd>
          </motion.button>
        )}
      </AnimatePresence>
      <UsageMeter />
      <PortsPopover />
      <IconButton title="Command palette (⌘K)" onClick={() => set({ paletteOpen: true })}>
        <Command size={15} />
      </IconButton>
      <IconButton title="Overview (⌘⇧O)" onClick={() => set({ overviewOpen: true })}>
        <LayoutDashboard size={15} />
      </IconButton>
      <span data-bus-anchor>
        <IconButton title="Session bus (⌘B)" active={busOpen} badge={userUnread || null} onClick={() => set({ busOpen: !busOpen, userUnread: 0 })}>
          <MessagesSquare size={15} />
        </IconButton>
      </span>
      <IconButton title="Guide (⌘/)" onClick={() => set({ helpOpen: true })}>
        <CircleHelp size={15} />
      </IconButton>
      <IconButton title="Settings" onClick={() => set({ settingsOpen: true })}>
        <Settings2 size={15} />
      </IconButton>
    </div>
  )
}

function PageTab({ page, active, onClick }: { page: Page; active: boolean; onClick: () => void }) {
  const { sessions, projects, renamePage, removePage, moveTile } = useApp()
  const [editing, setEditing] = useState(false)
  const [over, setOver] = useState(false)
  const pageSessions = page.tiles.map((t) => sessions[t.sessionId]).filter(Boolean)
  const colors = [...new Set(pageSessions.map((s) => projects.find((p) => p.id === s.projectId)?.color ?? '#888'))]
  const needs = pageSessions.filter((s) => s.status === 'waiting').length
  const working = pageSessions.filter((s) => s.status === 'working').length
  const firstProject = projects.find((p) => p.id === pageSessions[0]?.projectId)

  return (
    <motion.div
      layout
      layoutId={firstProject && pageSessions.every((s) => s.projectId === firstProject.id) ? `project-${firstProject.path}` : undefined}
      initial={{ opacity: 0, scale: 0.7, width: 0 }}
      animate={{ opacity: 1, scale: over ? 1.08 : 1, width: 'auto' }}
      exit={{ opacity: 0, scale: 0.7, width: 0 }}
      transition={spring.bouncy}
      onClick={onClick}
      onDoubleClick={() => setEditing(true)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-orch-tile')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false)
        const id = e.dataTransfer.getData('application/x-orch-tile')
        if (id) moveTile(id, page.id)
      }}
      className={cx(
        'group relative flex h-8 shrink-0 cursor-default items-center gap-2 overflow-hidden rounded-xl px-3 text-[12.5px] font-medium whitespace-nowrap',
        active ? 'text-white' : 'text-white/50 hover:text-white/85',
        over && 'ring-2 ring-violet-400/60',
      )}
    >
      {active && (
        <motion.span
          layoutId="active-page"
          transition={spring.snappy}
          className="absolute inset-0 rounded-xl border border-white/10 bg-white/[0.08] shadow-[0_8px_24px_-12px_rgba(167,139,250,0.6)]"
        />
      )}
      <span className="relative flex -space-x-1">
        {(colors.length ? colors : ['rgba(255,255,255,0.25)']).slice(0, 4).map((c) => (
          <span key={c} className="h-2 w-2 rounded-full ring-2 ring-[#0b0b12]" style={{ background: c }} />
        ))}
      </span>
      {editing ? (
        <input
          autoFocus
          defaultValue={page.name}
          onBlur={(e) => {
            renamePage(page.id, e.target.value || page.name)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
          className="relative w-28 rounded bg-black/40 px-1 text-white outline-none"
        />
      ) : (
        <span className="relative">{page.name}</span>
      )}
      <span className="relative text-[10.5px] text-white/35">{page.tiles.length}</span>
      {working > 0 && <span className="relative h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />}
      <AnimatePresence>
        {needs > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={spring.bouncy}
            className="relative grid h-4 min-w-4 place-items-center rounded-full bg-amber-400 px-1 text-[9.5px] font-bold text-black"
          >
            {needs}
          </motion.span>
        )}
      </AnimatePresence>
      <span
        onClick={(e) => {
          e.stopPropagation()
          if (!page.tiles.length || confirm(`Close "${page.name}" and stop its ${page.tiles.length} session(s)?`)) removePage(page.id)
        }}
        className="relative -mr-1 hidden rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white group-hover:block"
      >
        <X size={11} />
      </span>
    </motion.div>
  )
}
