import { AnimatePresence, motion } from 'motion/react'
import { Globe, Play, Plug, RefreshCw, Skull } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { PortsSnapshot } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx, tildify } from '../lib/util'
import { tileForSession, useApp } from '../store/app'
import { IconButton, Popover } from './ui'

/** Every listening port the app can see, who owns it, and what to do about it */
export function PortsPopover() {
  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState<PortsSnapshot | null>(null)
  const { sessions, projects, toast } = useApp()
  const owned = Object.values(sessions).reduce((n, s) => n + s.ports.length, 0)

  const load = useCallback(() => orch.invoke('ports:list').then(setSnap), [])
  useEffect(() => {
    if (!open) return
    load()
    const t = setInterval(load, 2500)
    return () => clearInterval(t)
  }, [open, load])

  const preview = (sessionId: string | undefined, port: number) => {
    const st = useApp.getState()
    // A dev server has no tile of its own; use a tile working in the same checkout.
    const cwd = sessionId ? st.sessions[sessionId]?.cwd : undefined
    const target =
      (sessionId ? tileForSession(st.pages, sessionId) : null) ??
      (cwd ? Object.values(st.sessions).filter((s) => s.cwd === cwd).map((s) => tileForSession(st.pages, s.id)).find(Boolean) : null)
    if (!target) return orch.invoke('shell:openExternal', `http://localhost:${port}`)
    st.setActivePage(target.page.id)
    st.setPreview(target.tile.id, { open: true, url: `http://localhost:${port}` })
    setOpen(false)
  }

  const kill = async (pid: number, port: number, sessionId?: string) => {
    if (!sessionId && !confirm(`Nothing in Orchestrator owns :${port} (pid ${pid}). Kill it anyway?`)) return
    const ok = await orch.invoke('ports:kill', pid)
    toast(ok ? `Stopped :${port}` : `Could not stop pid ${pid}`, ok ? 'ok' : 'error')
    setTimeout(load, 700)
  }

  const restart = async (sessionId: string) => {
    const s = sessions[sessionId]
    if (!s) return
    const project = projects.find((p) => p.id === s.projectId)
    try {
      await orch.invoke('dev:start', s.cwd, project?.path ?? s.cwd)
      toast(`Restarting the dev server in ${s.branch ?? s.cwd}`, 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const owner = (sid?: string) => (sid ? sessions[sid] : undefined)

  return (
    <div className="no-drag relative">
      <button
        title="Ports"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors',
          open ? 'bg-violet-500/20 text-violet-100' : 'text-white/60 hover:bg-white/[0.08] hover:text-white',
        )}
      >
        <Plug size={14} />
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={owned} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={spring.snappy}>
            {owned}
          </motion.span>
        </AnimatePresence>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={460}>
        <div className="flex items-center justify-between px-2 pt-1 pb-2">
          <div className="text-[13px] font-semibold">Listening ports</div>
          <IconButton title="Rescan" onClick={load}>
            <RefreshCw size={13} />
          </IconButton>
        </div>
        <div className="max-h-[380px] space-y-1 overflow-y-auto scroll-thin">
          {snap?.listeners.map((l) => {
            const s = owner(l.sessionId)
            const color = s ? projects.find((p) => p.id === s.projectId)?.color : undefined
            return (
              <motion.div
                key={`${l.pid}:${l.port}`}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={spring.snappy}
                className="group flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-white/[0.05]"
              >
                <span className="w-14 font-mono text-[13px] font-semibold text-emerald-200">:{l.port}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[12.5px]">
                    {color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
                    <span className="truncate text-white/85">{s ? `${s.name} · ${s.branch ?? ''}` : 'not in Orchestrator'}</span>
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-white/40">
                    {l.command ?? '?'} · pid {l.pid} {l.cwd ? `· ${tildify(l.cwd, orch.homedir)}` : ''}
                  </div>
                </div>
                <div className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                  <IconButton title="Open in preview" onClick={() => preview(l.sessionId, l.port)}>
                    <Globe size={13} />
                  </IconButton>
                  {s && (
                    <IconButton title="Restart this worktree's dev server" onClick={() => restart(s.id)}>
                      <Play size={13} />
                    </IconButton>
                  )}
                  <IconButton title="Kill" onClick={() => kill(l.pid, l.port, l.sessionId)} className="hover:!text-rose-300">
                    <Skull size={13} />
                  </IconButton>
                </div>
              </motion.div>
            )
          })}
          {snap && !snap.listeners.length && <div className="px-3 py-6 text-center text-[12.5px] text-white/40">Nothing is listening.</div>}
          {!snap && <div className="px-3 py-6 text-center text-[12.5px] text-white/40">Scanning…</div>}
        </div>
        {!!snap?.reserved.length && (
          <div className="mt-2 border-t border-white/[0.06] px-2 pt-2">
            <div className="mb-1 text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase">Reserved by worktrees</div>
            {snap.reserved.map((r) => (
              <div key={r.path} className="flex items-center gap-2 py-1 font-mono text-[11px] text-white/55">
                <span className={cx('h-1.5 w-1.5 rounded-full', r.live ? 'bg-emerald-400' : 'bg-white/25')} />
                <span className="w-24">
                  :{r.web} :{r.api}
                </span>
                <span className="truncate">{r.path.split('/').pop()}</span>
              </div>
            ))}
          </div>
        )}
      </Popover>
    </div>
  )
}
