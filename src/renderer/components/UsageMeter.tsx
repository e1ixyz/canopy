import { Gauge } from 'lucide-react'
import { useMemo, useState } from 'react'
import { submitPrompt } from '../lib/terms'
import { cx } from '../lib/util'
import { findTile, useApp } from '../store/app'
import { Button, fmtTokens, Popover } from './ui'

const billable = (t: { input: number; output: number; cacheWrite: number }) => t.input + t.output + t.cacheWrite

/** Today's token use across every session, from their transcripts */
export function UsageMeter() {
  const [open, setOpen] = useState(false)
  const { usage, sessions, projects } = useApp()
  const today = usage ? billable(usage.today) : 0

  const rows = useMemo(() => {
    if (!usage) return []
    return Object.entries(usage.sessions)
      .map(([id, u]) => ({ id, s: sessions[id], today: billable(u.today), cache: u.today.cacheRead, model: u.model }))
      .filter((r) => r.s)
      .sort((a, b) => b.today - a.today)
  }, [usage, sessions])

  const byProject = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.s.projectId, (m.get(r.s.projectId) ?? 0) + r.today)
    return [...m.entries()].map(([pid, n]) => ({ p: projects.find((x) => x.id === pid), n })).sort((a, b) => b.n - a.n)
  }, [rows, projects])

  const max = Math.max(1, ...rows.map((r) => r.today))
  const limited = Object.values(sessions).some((s) => s.attention && /limit/i.test(s.attention))

  const runUsage = () => {
    const st = useApp.getState()
    const hit = st.activeTileId ? findTile(st.pages, st.activeTileId) : null
    const id = hit?.tile.sessionId ?? rows[0]?.id
    if (id && sessions[id]?.kind === 'claude') submitPrompt(id, '/usage')
    setOpen(false)
  }

  return (
    <div className="no-drag relative">
      <button
        title="Token use today"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-7 items-center gap-1.5 rounded-lg px-2 font-mono text-[11.5px] transition-colors',
          limited ? 'bg-rose-500/15 text-rose-200' : open ? 'bg-violet-500/20 text-violet-100' : 'text-white/60 hover:bg-white/[0.08] hover:text-white',
        )}
      >
        <Gauge size={14} />
        {fmtTokens(today)}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={380}>
        <div className="px-2 pt-1 pb-2">
          <div className="text-[13px] font-semibold">Tokens today</div>
          <div className="text-[11.5px] text-white/45">
            Input + output + cache writes, read from each session's transcript. Cache reads ({fmtTokens(usage?.today.cacheRead ?? 0)}) are listed apart: they are cheap.
          </div>
        </div>
        <div className="max-h-[300px] space-y-1.5 overflow-y-auto scroll-thin px-2">
          {rows.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-2 text-[12px]">
                <span className="truncate font-medium text-white/85">{r.s.name}</span>
                <span className="truncate text-[10.5px] text-white/35">{r.model?.replace(/^claude-/, '')}</span>
                <span className="ml-auto font-mono text-white/70">{fmtTokens(r.today)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-sky-400 transition-[width] duration-700" style={{ width: `${(r.today / max) * 100}%` }} />
              </div>
            </div>
          ))}
          {!rows.length && <div className="py-4 text-center text-[12px] text-white/40">No Claude sessions yet.</div>}
        </div>
        {byProject.length > 1 && (
          <div className="mt-3 border-t border-white/[0.06] px-2 pt-2">
            {byProject.map(({ p, n }) => (
              <div key={p?.id ?? '?'} className="flex items-center gap-2 py-0.5 text-[11.5px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p?.color ?? '#888' }} />
                {p?.name ?? 'other'}
                <span className="ml-auto font-mono">{fmtTokens(n)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex justify-end border-t border-white/[0.06] px-1 pt-2">
          <Button size="sm" tone="soft" onClick={runUsage}>
            Run /usage in the active tile
          </Button>
        </div>
      </Popover>
    </div>
  )
}
