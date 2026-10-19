import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Lock, RefreshCw, Send, Trash2, Unlock, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BusMessage, Conflict } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx, hashColor, tildify, timeAgo } from '../lib/util'
import { useApp } from '../store/app'
import { IconButton, Segmented, Toggle } from './ui'

export function BusDrawer() {
  const { busOpen, set } = useApp()
  const [tab, setTab] = useState<'feed' | 'claims' | 'conflicts'>('feed')
  return (
    <AnimatePresence>
      {busOpen && (
        <motion.aside
          initial={{ x: 420, opacity: 0, scale: 0.96 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 420, opacity: 0, scale: 0.96 }}
          transition={spring.bouncy}
          className="glass absolute top-14 right-3 bottom-3 z-40 flex w-[400px] flex-col overflow-hidden rounded-3xl shadow-[var(--pop-shadow)]"
        >
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <div className="flex-1">
              <div className="text-[15px] font-semibold tracking-tight">Session bus</div>
              <div className="text-[11.5px] text-white/40">Messages, file claims and overlap between worktrees</div>
            </div>
            <IconButton title="Close (⌘B)" onClick={() => set({ busOpen: false })}>
              <X size={14} />
            </IconButton>
          </div>
          <div className="px-4 pb-3">
            <Segmented
              id="bus"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'feed', label: 'Feed' },
                { value: 'claims', label: 'Claims' },
                { value: 'conflicts', label: 'Overlap' },
              ]}
            />
          </div>
          <div className="relative min-h-0 flex-1">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                className="absolute inset-0 flex flex-col"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={spring.snappy}
              >
                {tab === 'feed' && <Feed />}
                {tab === 'claims' && <Claims />}
                {tab === 'conflicts' && <Conflicts />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function useName() {
  const sessions = useApp((s) => s.sessions)
  return (id: string) => (id === 'user' ? 'you' : id === 'project' ? 'project' : id === '*' ? 'everyone' : (sessions[id]?.name ?? id.slice(0, 6)))
}

function Feed() {
  const { messages, sessions, toast, projects } = useApp()
  // "Everyone on the project" means the project of the tile you're working in
  const activeProjectId = useApp((st) => {
    const hit = st.activeTileId ? st.pages.flatMap((p) => p.tiles).find((t) => t.id === st.activeTileId) : undefined
    const page = st.pages.find((p) => p.id === st.activePageId)
    const sid = hit?.sessionId ?? page?.tiles[0]?.sessionId
    return sid ? st.sessions[sid]?.projectId : undefined
  })
  const activeProject = projects.find((p) => p.id === activeProjectId)
  const name = useName()
  const list = useRef<HTMLDivElement>(null)
  const [to, setTo] = useState('project')
  const [body, setBody] = useState('')
  const [wake, setWake] = useState(true)
  const [showSystem, setShowSystem] = useState(false)
  const shown = useMemo(
    () => messages.filter((m) => showSystem || m.kind === 'message' || m.kind === 'handoff' || m.kind === 'broadcast').slice(-200),
    [messages, showSystem],
  )
  // Scroll only the feed: scrollIntoView also scrolls the overflow-hidden app root while the drawer slides in off-screen
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [shown.length])
  const claude = Object.values(sessions).filter((s) => s.kind === 'claude' && s.status !== 'exited')
  // A recipient that exited or was closed drops out of the select; don't keep sending to it.
  useEffect(() => {
    if (to !== 'project' && !claude.some((s) => s.id === to)) setTo('project')
  }, [to, claude])

  const send = async () => {
    if (!body.trim()) return
    try {
      if (to === 'project' && !activeProjectId) return toast('Open a tile of the project first, or pick a session', 'warn')
      await orch.invoke('bus:send', { to, body: body.trim(), wake, projectId: to === 'project' ? activeProjectId : undefined })
      setBody('')
      toast(`Sent to ${to === 'project' ? `everyone on ${activeProject?.name ?? 'the project'}` : name(to)}`, 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 pb-2 text-[11px] text-white/40">
        <Toggle on={showSystem} onChange={setShowSystem} label={<span className="text-[11.5px] text-white/50">Show claims & system</span>} />
        <button onClick={() => orch.invoke('bus:clear')} className="no-drag flex items-center gap-1 hover:text-white/70">
          <Trash2 size={11} /> Clear
        </button>
      </div>
      <div ref={list} className="min-h-0 flex-1 space-y-2 overflow-y-auto scroll-thin px-3 pb-3">
        <AnimatePresence initial={false}>
          {shown.map((m) => (
            <Bubble key={m.id} m={m} name={name} />
          ))}
        </AnimatePresence>
        {!shown.length && (
          <div className="px-6 py-16 text-center text-[12.5px] leading-relaxed text-white/35">
            Quiet so far. Sessions talk here with <code className="font-mono text-white/55">send_message</code>; you can too.
          </div>
        )}
      </div>
      <div className="border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center gap-2">
          <select value={to} onChange={(e) => setTo(e.target.value)} className="no-drag h-7 rounded-lg border border-white/[0.08] bg-black/30 px-2 text-[12px] text-white/80 outline-none">
            <option value="project">Everyone on {activeProject?.name ?? 'the project'}</option>
            <option value="*">Every session</option>
            {claude.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => setWake(!wake)}
            title="Wake idle sessions to act on it now"
            className={cx('no-drag flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] transition', wake ? 'bg-amber-400/15 text-amber-200' : 'bg-white/[0.04] text-white/40')}
          >
            <Zap size={11} /> wake
          </button>
        </div>
        <div className="flex gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={2}
            placeholder="Message the sessions…"
            className="no-drag min-h-0 flex-1 resize-none rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-[12.5px] text-white placeholder-white/30 outline-none focus:border-violet-400/40"
          />
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            transition={spring.bouncy}
            onClick={send}
            className="no-drag grid w-10 place-items-center orch-btn-primary rounded-xl bg-violet-500 text-on-accent"
          >
            <Send size={15} />
          </motion.button>
        </div>
      </div>
    </>
  )
}

function Bubble({ m, name }: { m: BusMessage; name: (id: string) => string }) {
  const jump = useApp((s) => s.jumpToSession)
  const mine = m.from === 'user'
  const sys = m.kind !== 'message' && m.kind !== 'handoff' && m.kind !== 'broadcast'
  const color = mine ? 'var(--color-violet-400)' : hashColor(name(m.from))
  if (sys)
    return (
      <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.snappy} className="flex items-center gap-2 px-2 text-[11px] text-white/35">
        {m.kind === 'claim' ? <Lock size={10} /> : m.kind === 'release' ? <Unlock size={10} /> : <Zap size={10} />}
        <span className="text-white/55">{name(m.from)}</span> {m.body}
        <span className="ml-auto shrink-0">{timeAgo(m.ts)}</span>
      </motion.div>
    )
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={spring.bouncy}
      className={cx('flex gap-2', mine && 'flex-row-reverse')}
    >
      <button
        onClick={() => !mine && jump(m.from)}
        className={cx(
          'no-drag mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          mine ? 'bg-violet-500 text-on-accent' : 'text-[rgba(0,0,0,0.75)]',
        )}
        style={mine ? undefined : { background: color }}
        title={name(m.from)}
      >
        {name(m.from).slice(0, 1).toUpperCase()}
      </button>
      <div className={cx('max-w-[300px] min-w-0', mine && 'text-right')}>
        <div className={cx('mb-0.5 flex items-center gap-1 text-[10.5px] text-white/40', mine && 'justify-end')}>
          <span className="font-semibold text-white/65">{name(m.from)}</span>
          <ArrowRight size={9} />
          <span>{name(m.to)}</span>
          {m.kind === 'handoff' && <span className="rounded bg-fuchsia-400/20 px-1 text-fuchsia-200">handoff</span>}
          <span className="ml-1">{timeAgo(m.ts)}</span>
        </div>
        <div
          className={cx(
            'inline-block rounded-2xl px-3 py-2 text-left text-[12.5px] leading-relaxed whitespace-pre-wrap select-text',
            mine ? 'rounded-tr-md bg-violet-500/25 text-white' : 'rounded-tl-md bg-white/[0.06] text-white/85',
          )}
        >
          {m.body.length > 1200 ? m.body.slice(0, 1200) + '…' : m.body}
        </div>
      </div>
    </motion.div>
  )
}

function Claims() {
  const { claims, sessions } = useApp()
  const name = useName()
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scroll-thin px-3 pb-3">
      <AnimatePresence initial={false}>
        {claims.map((c) => (
          <motion.div
            key={c.id}
            layout
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20, height: 0 }}
            transition={spring.snappy}
            className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.03] px-3 py-2"
          >
            <Lock size={12} className="shrink-0" style={{ color: hashColor(name(c.sessionId)) }} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[12px] text-white/85">{c.pattern}</div>
              <div className="truncate text-[11px] text-white/40">
                {sessions[c.sessionId]?.name ?? 'gone'} · {c.reason || 'no reason'} · {timeAgo(c.ts)}
              </div>
            </div>
            <button onClick={() => orch.invoke('claims:release', c.id)} className="no-drag rounded-lg px-2 py-1 text-[11px] text-white/45 hover:bg-white/10 hover:text-white">
              Release
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
      {!claims.length && (
        <div className="px-6 py-16 text-center text-[12.5px] leading-relaxed text-white/35">
          No claims. Sessions call <code className="font-mono text-white/55">claim</code> before editing; anyone else touching those files gets asked first.
        </div>
      )}
    </div>
  )
}

function Conflicts() {
  const { projects, sessions } = useApp()
  const [data, setData] = useState<Record<string, Conflict[]>>({})
  const [loading, setLoading] = useState(false)
  const active = projects.filter((p) => Object.values(sessions).some((s) => s.projectId === p.id))
  const load = async () => {
    setLoading(true)
    const out: Record<string, Conflict[]> = {}
    for (const p of active) out[p.path] = await orch.invoke('conflicts:get', p.path)
    setData(out)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-3 pb-3">
      <div className="mb-2 flex items-center justify-between px-1 text-[11.5px] text-white/40">
        <span>Files changed in more than one worktree</span>
        <button onClick={load} className="no-drag flex items-center gap-1 hover:text-white/70">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Rescan
        </button>
      </div>
      {active.map((p) => (
        <div key={p.id} className="mb-4">
          <div className="mb-1.5 flex items-center gap-2 px-1 text-[12px] font-semibold text-white/70">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.name}
          </div>
          {(data[p.path] ?? []).map((c) => (
            <div key={c.file} className="mb-1 rounded-xl border border-amber-300/15 bg-amber-400/[0.05] px-3 py-2">
              <div className="truncate font-mono text-[12px] text-amber-100/90">{c.file}</div>
              <div className="mt-0.5 text-[10.5px] text-white/40">{c.worktrees.map((w) => tildify(w, orch.homedir).split('/').pop()).join(' · ')}</div>
            </div>
          ))}
          {data[p.path] && !data[p.path].length && <div className="px-1 text-[12px] text-emerald-300/60">No overlap between worktrees.</div>}
        </div>
      ))}
      {!active.length && <div className="py-16 text-center text-[12.5px] text-white/35">No projects running.</div>}
    </div>
  )
}
