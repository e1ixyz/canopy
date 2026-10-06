import { AnimatePresence, motion } from 'motion/react'
import {
  Archive,
  Cloud,
  Database,
  Palette,
  PanelRight,
  ArchiveX,
  Camera,
  Eraser,
  Flag,
  GitPullRequest,
  Rocket,
  Wrench,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  FolderOpen,
  GitBranch,
  GitFork,
  Globe,
  GripVertical,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Play,
  RotateCcw,
  Send,
  Terminal as TermIcon,
  X,
} from 'lucide-react'
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AdapterAction, Session, Tile as TileT } from '@shared/types'
import type { Rect } from '../lib/layout'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { askPrompt } from '../lib/prompts'
import { openDb, openDeploy } from '../lib/tiles'
import { submitPrompt } from '../lib/terms'
import { cx, tildify } from '../lib/util'
import { useApp } from '../store/app'
import { PreviewPane } from './PreviewPane'
import { PrPanel } from './PrPanel'
import { DesignView } from './DesignView'
import { DbPanel, DeployPanel } from './SidePanels'
import { BadgeChip, GoalChip, ModeChips, saveHandoff, useFreshHandoff } from './TileChips'
import { TerminalView } from './TerminalView'
import { Button, IconButton, Popover, Ring, StatusPill } from './ui'
import { ProfileChip } from './Profiles'

const ROLE_STYLE: Record<string, string> = {
  lead: 'bg-fuchsia-400/15 text-fuchsia-200',
  worker: 'bg-sky-400/15 text-sky-200',
  reviewer: 'bg-amber-400/15 text-amber-200',
  qa: 'bg-emerald-400/15 text-emerald-200',
  docs: 'bg-indigo-400/15 text-indigo-200',
}

let dragId: string | null = null
let lastSwap = 0

export const Tile = memo(function Tile({
  tile,
  rect,
  pageId,
  focused,
  dimmed,
}: {
  tile: TileT
  rect: Rect
  pageId: string
  focused: boolean
  dimmed: boolean
}) {
  const s = useApp((st) => st.sessions[tile.sessionId])
  const project = useApp((st) => st.projects.find((p) => p.id === s?.projectId))
  const active = useApp((st) => st.activeTileId === tile.id)
  const selected = useApp((st) => st.selected.includes(tile.id))
  const ports = useApp((st) => {
    if (!s) return ''
    const set = new Set<number>()
    for (const o of Object.values(st.sessions)) if (o.cwd === s.cwd) o.ports.forEach((p) => set.add(p))
    return [...set].sort((a, b) => a - b).join(',')
  })
  const devSession = useApp((st) => Object.values(st.sessions).find((o) => o.kind === 'dev' && s && o.cwd === s.cwd && o.id !== s.id))
  const { setActiveTile, toggleSelect, focusTile, togglePreview, closeTile, swapTiles } = useApp()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [ctxOpen, setCtxOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(true)
  const prOpen = useApp((st) => st.prFor === tile.id)
  const fresh = useFreshHandoff()

  if (!s) return null
  const portList = ports ? ports.split(',').map(Number) : []
  const color = project?.color ?? '#a78bfa'
  // Only checkout tiles get a browser preview of the worktree's dev server.
  const previewable = s.kind === 'claude' || s.kind === 'shell' || s.kind === 'dev'
  const side = (s.kind === 'db' || s.kind === 'deploy') && sideOpen && rect.w > 520
  const preview = tile.preview?.open
  const split = tile.preview?.split ?? 0.45
  const glow =
    s.status === 'waiting'
      ? '0 0 0 1px color-mix(in oklab, var(--color-amber-400) 70%, transparent), 0 0 32px -8px color-mix(in oklab, var(--color-amber-400) 50%, transparent)'
      : active
        ? 'var(--tile-shadow-active)'
        : 'var(--tile-shadow)'

  const openPreview = () => {
    const url = tile.preview?.url || s.url || (portList[0] ? `http://localhost:${portList[0]}` : '')
    togglePreview(tile.id, url)
  }

  return (
    <motion.div
      data-session={s.id}
      initial={{ opacity: 0, scale: 0.82, x: rect.x, y: rect.y + 30, width: rect.w, height: rect.h }}
      animate={{
        opacity: dimmed ? 0.92 : 1,
        scale: dragOver ? 0.975 : 1,
        x: rect.x,
        y: rect.y,
        width: rect.w,
        height: rect.h,
      }}
      exit={{ opacity: 0, scale: 0.8, filter: 'blur(8px)', transition: { duration: 0.22 } }}
      transition={spring.layout}
      onMouseDown={() => setActiveTile(tile.id)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-orch-tile') || !dragId || dragId === tile.id) return
        e.preventDefault()
        setDragOver(true)
        if (Date.now() - lastSwap > 280) {
          lastSwap = Date.now()
          swapTiles(dragId, tile.id)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={() => setDragOver(false)}
      className={cx(
        'orch-tile absolute top-0 left-0 flex flex-col overflow-hidden rounded-[var(--tile-radius)]',
        selected && 'outline-2 outline-offset-2 outline-violet-400/70',
      )}
      style={{ background: 'var(--tile-bg)', backdropFilter: 'var(--tile-blur)', boxShadow: glow }}
      data-active={active}
      data-status={s.status}
    >
      {s.status === 'waiting' && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[var(--tile-radius)] ring-2 ring-amber-300/40"
          animate={{ opacity: [0.2, 0.9, 0.2] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}

      {/* header */}
      <div
        draggable
        onDragStart={(e) => {
          dragId = tile.id
          e.dataTransfer.setData('application/x-orch-tile', tile.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragEnd={() => {
          dragId = null
        }}
        onClick={(e) => e.shiftKey && toggleSelect(tile.id)}
        onDoubleClick={() => focusTile(focused ? null : tile.id)}
        className="orch-tile-head group/h flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-white/[0.06] pr-1.5 pl-2 active:cursor-grabbing"
      >
        <GripVertical size={13} className="text-white/20 transition group-hover/h:text-white/45" />
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        {renaming ? (
          <input
            autoFocus
            defaultValue={s.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              orch.invoke('session:rename', s.id, e.target.value)
              setRenaming(false)
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-28 rounded bg-black/40 px-1 text-[13px] text-white outline-none"
          />
        ) : (
          <span className="max-w-[40%] min-w-[4ch] shrink-0 truncate text-[13px] font-semibold text-white/90">{s.name}</span>
        )}
        {s.kind !== 'claude' && (
          <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/50">{s.kind}</span>
        )}
        {s.role !== 'plain' && (
          <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase', ROLE_STYLE[s.role])}>{s.role}</span>
        )}
        {rect.w >= 380 && <ProfileChip session={s} />}
        <StatusPill status={s.status} compact={rect.w < 460} />
        <BadgeChip s={s} />
        <GoalChip s={s} />
        <AnimatePresence mode="popLayout">
          {s.task && rect.w > 520 && (
            <motion.span
              key={s.task}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring.snappy}
              className="min-w-0 truncate text-[12px] text-white/45"
              title={s.task}
            >
              {s.task}
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex-1" />
        {rect.w > 640 && <ModeChips s={s} compact={rect.w < 860} />}
        {s.contextPct !== undefined && (
          <div className="relative" onDoubleClick={(e) => e.stopPropagation()}>
            <motion.button
              onClick={() => setCtxOpen((o) => !o)}
              animate={s.contextPct >= 80 ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={s.contextPct >= 80 ? { duration: 1.4, repeat: Infinity } : spring.snappy}
              className={cx('no-drag flex shrink-0 items-center gap-1 rounded-md px-1 text-[10.5px] whitespace-nowrap', s.contextPct >= 80 ? 'text-rose-200' : 'text-white/40 hover:text-white/70')}
              title={`${s.contextPct}% of context used`}
            >
              <Ring pct={s.contextPct} size={16} />
              {rect.w > 560 && `${s.contextPct}%`}
            </motion.button>
            <Popover open={ctxOpen} onClose={() => setCtxOpen(false)} width={260}>
              <div className="px-2 pt-1 pb-2 text-[12.5px] text-white/75">
                {s.contextPct}% of the context window used.{s.contextPct >= 80 ? ' Time for a fresh start.' : ''}
              </div>
              <div className="grid gap-1.5">
                <Button size="sm" tone="primary" onClick={() => (setCtxOpen(false), fresh(s))}>
                  <Send size={12} /> Fresh session with handoff
                </Button>
                <Button size="sm" tone="soft" onClick={() => (setCtxOpen(false), saveHandoff(s))}>
                  <Archive size={12} /> Save handoff for later
                </Button>
                <Button size="sm" tone="soft" onClick={() => (setCtxOpen(false), submitPrompt(s.id, '/clear'))}>
                  <Eraser size={12} /> Clear context
                </Button>
                <Button size="sm" onClick={() => (setCtxOpen(false), submitPrompt(s.id, '/compact'))}>
                  Compact
                </Button>
              </div>
            </Popover>
          </div>
        )}
        {s.unread > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring.bouncy}
            className="shrink-0 rounded-full bg-sky-400/20 px-1.5 text-[10.5px] font-semibold whitespace-nowrap text-sky-200"
            title="Unread bus messages"
          >
            ✉ {s.unread}
          </motion.span>
        )}
        {(s.kind === 'db' || s.kind === 'deploy') && (
          <IconButton title={sideOpen ? 'Hide panel' : 'Show panel'} active={sideOpen} onClick={() => setSideOpen((o) => !o)}>
            <PanelRight size={14} />
          </IconButton>
        )}
        {previewable && (
          <IconButton
            title={portList.length ? `Preview :${portList.join(', :')} (⌘⇧P)` : 'Open preview'}
            active={preview}
            onClick={openPreview}
          >
            <Globe size={14} />
            {portList.length > 0 && <span className="absolute right-1 bottom-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </IconButton>
        )}
        <IconButton title={focused ? 'Exit focus (⌘↵)' : 'Focus (⌘↵)'} onClick={() => focusTile(focused ? null : tile.id)}>
          {focused ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </IconButton>
        <div className="relative">
          <IconButton title="More" onClick={() => setMenu((m) => !m)} active={menu}>
            <MoreHorizontal size={15} />
          </IconButton>
          <AnimatePresence>
            {menu && (
              <TileMenu
                tileId={tile.id}
                s={s}
                projectPath={project?.path ?? s.cwd}
                onClose={() => setMenu(false)}
                onRename={() => setRenaming(true)}
                onCloseTile={() => {
                  if (s.status === 'working' && !confirm(`${s.name} is working. Stop it and close?`)) return
                  closeTile(tile.id)
                }}
                hasDev={!!devSession}
              />
            )}
          </AnimatePresence>
        </div>
        <IconButton
          title="Close session (⌘W)"
          onClick={() => {
            if (s.status === 'working' && !confirm(`${s.name} is working. Stop it and close?`)) return
            closeTile(tile.id)
          }}
        >
          <X size={14} />
        </IconButton>
      </div>

      {/* body */}
      <div className="relative flex min-h-0 flex-1">
        <motion.div
          className={cx('relative min-w-0', s.kind !== 'design' && 'orch-term orch-term-wrap')}
          animate={{ flexBasis: preview ? `${split * 100}%` : '100%' }}
          transition={spring.layout}
          style={{ flexGrow: 0, flexShrink: side ? 1 : 0 }}
        >
          {s.kind === 'design' ? (
            <div className="absolute inset-0 flex flex-col">
              <DesignView s={s} />
            </div>
          ) : (
            <>
              <TerminalView sessionId={s.id} visible tileId={tile.id} />
              <ExitedOverlay s={s} />
            </>
          )}
        </motion.div>
        <AnimatePresence>
          {side && s.kind === 'db' && <DbPanel key="db" s={s} projectPath={project?.path ?? s.cwd} />}
          {side && s.kind === 'deploy' && <DeployPanel key="deploy" s={s} />}
        </AnimatePresence>
        <AnimatePresence>{prOpen && <PrPanel key="pr" s={s} tileId={tile.id} onClose={() => useApp.getState().set({ prFor: null })} />}</AnimatePresence>
        <AnimatePresence>
          {preview && (
            <PreviewPane
              key="preview"
              tile={tile}
              session={s}
              ports={portList}
              pageId={pageId}
              projectPath={project?.path ?? s.cwd}
              devSession={devSession}
            />
          )}
        </AnimatePresence>
      </div>

      {s.kind !== 'host' && s.kind !== 'design' && <GitStrip s={s} narrow={rect.w < 480} tileId={tile.id} />}
    </motion.div>
  )
})

function ExitedOverlay({ s }: { s: Session }) {
  const dead = s.status === 'exited' || s.status === 'error'
  return (
    <AnimatePresence>
      {dead && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          transition={spring.bouncy}
          className="glass absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-2xl px-4 py-2.5 shadow-2xl"
        >
          <span className="text-[12.5px] text-white/70">
            {s.status === 'error' ? 'Crashed' : 'Exited'}
            {s.exitCode !== undefined ? ` (code ${s.exitCode})` : ''}
          </span>
          <button
            onClick={() => orch.invoke('session:restart', s.id)}
            className="no-drag flex items-center gap-1.5 rounded-lg bg-violet-500 px-2.5 py-1 text-[12px] font-medium text-on-accent hover:bg-violet-600"
          >
            <RotateCcw size={12} /> {s.kind === 'claude' ? 'Resume' : 'Restart'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function GitStrip({ s, narrow, tileId }: { s: Session; narrow: boolean; tileId: string }) {
  const g = useApp((st) => st.git[s.cwd])
  const refreshGit = useApp((st) => st.refreshGit)
  const reservedPorts = useApp((st) => st.sessions[s.id]?.ports)
  useEffect(() => {
    refreshGit(s.cwd)
    const t = setInterval(() => document.visibilityState === 'visible' && refreshGit(s.cwd), 12_000)
    return () => clearInterval(t)
  }, [s.cwd, refreshGit])
  const wt = /-wt-/.test(s.cwd) || s.cwd !== s.repo
  return (
    <div className="orch-strip flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-white/[0.06] px-3 font-mono text-[10.5px] whitespace-nowrap text-white/45">
      <span className="flex max-w-[45%] min-w-[4ch] shrink-0 items-center gap-1 text-white/55">
        <GitBranch size={10} className="shrink-0" />
        <span className="truncate">{g?.branch ?? s.branch ?? '—'}</span>
      </span>
      {g && (g.ahead > 0 || g.behind > 0) && (
        <span className="flex items-center gap-1.5">
          {g.ahead > 0 && (
            <span className="flex items-center text-emerald-300/70">
              <ArrowUp size={10} />
              {g.ahead}
            </span>
          )}
          {g.behind > 0 && (
            <span className="flex items-center text-amber-300/70">
              <ArrowDown size={10} />
              {g.behind}
            </span>
          )}
        </span>
      )}
      {g && g.dirty > 0 && <span className="text-sky-300/70">● {g.dirty}</span>}
      {g?.pr && (
        <button onClick={() => useApp.getState().set({ prFor: tileId })} className="no-drag text-violet-300/80 hover:text-violet-200" title="Open the PR panel">
          PR #{g.pr.number}
        </button>
      )}
      {wt && !narrow && <span className="rounded bg-white/[0.05] px-1 text-white/40">worktree</span>}
      <span className="flex-1" />
      {!narrow && <span className="min-w-0 shrink-[3] truncate">{tildify(s.cwd, orch.homedir)}</span>}
      {reservedPorts && reservedPorts.length > 0 && <span className="min-w-0 truncate text-emerald-300/60">:{reservedPorts.join(' :')}</span>}
    </div>
  )
}

function TileMenu({
  tileId,
  s,
  projectPath,
  onClose,
  onRename,
  onCloseTile,
  hasDev,
}: {
  tileId: string
  s: Session
  projectPath: string
  onClose: () => void
  onRename: () => void
  onCloseTile: () => void
  hasDev: boolean
}) {
  const { set, toast } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    return () => window.removeEventListener('mousedown', onDown)
  }, [onClose])
  const item = (icon: React.ReactNode, label: string, fn: () => void, hint?: string, danger?: boolean) => (
    <button
      key={label}
      onClick={() => {
        fn()
        onClose()
      }}
      className={cx(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
        danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-white/80 hover:bg-white/[0.08]',
      )}
    >
      <span className="text-white/45">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[10.5px] text-white/30">{hint}</span>}
    </button>
  )
  const claude = s.kind === 'claude'
  // Host and design tiles aren't in a checkout, so repo actions don't apply.
  const repo = s.kind !== 'host' && s.kind !== 'design'
  const fresh = useFreshHandoff()
  const [actions, setActions] = useState<AdapterAction[]>([])
  useEffect(() => {
    orch.invoke('adapter:actions', s.id).then(setActions).catch(() => {})
  }, [s.id])
  const runAction = async (a: AdapterAction) => {
    const sess = await orch.invoke('shell:run', s.cwd, projectPath, a.command, a.id)
    useApp.getState().addTile(sess.id)
  }
  // The tile clips its overflow, so the menu scrolls within the space left below its trigger.
  const [maxH, setMaxH] = useState<number>()
  useLayoutEffect(() => {
    const el = ref.current
    const tile = el?.closest('.orch-tile')
    if (!el || !tile) return
    setMaxH(Math.max(160, tile.getBoundingClientRect().bottom - el.getBoundingClientRect().top - 8))
  }, [])
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.9, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -4 }}
      transition={spring.bouncy}
      style={{ transformOrigin: 'top right', maxHeight: maxH }}
      className="glass absolute top-8 right-0 z-40 max-h-[70vh] w-64 overflow-y-auto scroll-thin rounded-2xl p-1.5 shadow-2xl"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {item(<Pencil size={13} />, 'Rename', onRename)}
      {item(<RotateCcw size={13} />, claude ? 'Restart (resume)' : 'Restart', () => orch.invoke('session:restart', s.id))}
      {claude && item(<GitFork size={13} />, 'New session in a fresh worktree', () => set({ newSession: { projectPath, mode: 'worktree' } }))}
      {claude && item(<NotebookPen size={13} />, 'Update HANDOFF.md', () => askPrompt(s.id, 'updateHandoff'))}
      {claude && item(<Send size={13} />, 'Fresh session with handoff', () => fresh(s))}
      {claude && item(<Archive size={13} />, 'Save handoff for later', () => saveHandoff(s))}
      {claude && item(<ArchiveX size={13} />, 'Save handoff and close', () => saveHandoff(s, true))}
      {claude && item(<Eraser size={13} />, 'Clear context', () => submitPrompt(s.id, '/clear'))}
      {claude && <div className="my-1 h-px bg-white/[0.06]" />}
      {claude && item(<Flag size={13} />, 'Goal…', () => set({ goalFor: s.id }))}
      {claude && item(<Rocket size={13} />, 'Ship…', () => set({ shipFor: s.id }))}
      {repo && item(<GitPullRequest size={13} />, 'Pull request', () => set({ prFor: tileId }))}
      {repo && item(<Camera size={13} />, 'Screenshot set…', () => {
        useApp.getState().setPreview(tileId, { open: true })
        setTimeout(() => set({ shotSet: { sessionId: s.id, tileId } }), 400)
      })}
      {repo && actions.length > 0 && (
        <>
          <div className="mt-1 mb-0.5 px-2.5 pt-1 text-[10px] font-semibold tracking-[0.12em] text-white/30 uppercase">Project</div>
          {actions.map((a) => item(<Wrench size={13} />, a.label, () => runAction(a)))}
        </>
      )}
      <div className="my-1 h-px bg-white/[0.06]" />
      {repo &&
        item(<Play size={13} />, hasDev ? 'Restart dev server' : 'Start dev server', async () => {
          try {
            await orch.invoke('dev:start', s.cwd, projectPath)
            toast('Dev server starting — the globe lights up when it listens', 'ok')
          } catch (e) {
            toast((e as Error).message, 'error')
          }
        })}
      {repo && item(<TermIcon size={13} />, 'Shell here', () => useApp.getState().spawn({ kind: 'shell', projectPath, cwd: s.cwd }))}
      {claude && item(<Palette size={13} />, 'Open design beside…', () => set({ designFor: s.id }))}
      {repo && item(<Database size={13} />, 'Database console here', () => openDb(s.cwd, projectPath))}
      {repo && item(<Cloud size={13} />, 'Railway logs & variables', () => openDeploy(s.cwd, projectPath))}
      {item(<FolderOpen size={13} />, 'Reveal in Finder', () => orch.invoke('shell:reveal', s.cwd))}
      {item(<Copy size={13} />, 'Copy session id', () => {
        navigator.clipboard.writeText(s.id)
        toast('Session id copied', 'ok')
      })}
      <div className="my-1 h-px bg-white/[0.06]" />
      {item(<Check size={13} />, 'Select for broadcast', () => useApp.getState().toggleSelect(useApp.getState().activeTileId ?? ''), '⇧click')}
      {item(<X size={13} />, 'Close session', onCloseTile, '⌘W', true)}
    </motion.div>
  )
}
