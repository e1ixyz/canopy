import { Gauge } from 'lucide-react'
import { useMemo, useState } from 'react'
import { submitPrompt } from '../lib/terms'
import { cx } from '../lib/util'
import { findTile, useApp } from '../store/app'
import { useProfiles } from '../lib/profiles'
import { Button, fmtTokens, Popover } from './ui'

/** US dollars, cents only under $10 */
export function fmtUsd(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return `$${n.toFixed(n >= 10 ? 0 : 2)}`
}

/** Today's usage across every session (closed ones too), priced per model from their transcripts */
export function UsageMeter() {
  const [open, setOpen] = useState(false)
  const { usage, sessions, projects } = useApp()
  const { profiles, multi, tint } = useProfiles()
  const today = usage?.today.cost ?? 0

  const rows = useMemo(() => {
    if (!usage) return []
    const live = Object.entries(usage.sessions)
      .filter(([id]) => sessions[id])
      .map(([id, u]) => ({ id, name: sessions[id].name, projectId: sessions[id].projectId, today: u.today.cost, model: u.model, closed: false }))
    const closed = (usage.closed ?? []).map((c) => ({ id: c.id, name: c.name, projectId: c.projectId, today: c.today.cost, model: c.model, closed: true }))
    return [...live, ...closed].sort((a, b) => b.today - a.today)
  }, [usage, sessions])

  const byProject = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.projectId, (m.get(r.projectId) ?? 0) + r.today)
    return [...m.entries()].map(([pid, n]) => ({ p: projects.find((x) => x.id === pid), n })).sort((a, b) => b.n - a.n)
  }, [rows, projects])

  const tokens: [string, number][] = usage
    ? [
        ['Input', usage.today.input],
        ['Output', usage.today.output],
        ['Cache writes', usage.today.cacheWrite],
        ['Cache reads', usage.today.cacheRead],
      ]
    : []

  const max = Math.max(1, ...rows.map((r) => r.today))
  const limited = Object.values(sessions).some((s) => s.attention && /limit/i.test(s.attention))

  const runUsage = () => {
    const st = useApp.getState()
    const hit = st.activeTileId ? findTile(st.pages, st.activeTileId) : null
    const id = hit?.tile.sessionId ?? rows.find((r) => !r.closed)?.id
    if (id && sessions[id]?.kind === 'claude') submitPrompt(id, '/usage')
    setOpen(false)
  }

  return (
    <div className="no-drag relative">
      <button
        title="Today’s usage at API prices"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-7 items-center gap-1.5 rounded-lg px-2 font-mono text-[11.5px] transition-colors',
          limited ? 'bg-rose-500/15 text-rose-200' : open ? 'bg-violet-500/20 text-violet-100' : 'text-white/60 hover:bg-white/[0.08] hover:text-white',
        )}
      >
        <Gauge size={14} />
        {fmtUsd(today)}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={380}>
        <div className="px-2 pt-1 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">Usage today</span>
            <span className="ml-auto font-mono text-[13px] text-white/85">{fmtUsd(today)}</span>
          </div>
          <div className="text-[11.5px] text-white/45">
            Priced at API list rates for the model that answered each message, cache reads included, from each session’s transcript.
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1">
            {tokens.map(([label, n]) => (
              <div key={label} className="rounded-md bg-white/[0.04] px-1.5 py-1">
                <div className="text-[10px] text-white/40">{label}</div>
                <div className="font-mono text-[11.5px] text-white/75">{fmtTokens(n)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="max-h-[300px] space-y-1.5 overflow-y-auto scroll-thin px-2">
          {rows.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-2 text-[12px]">
                <span className={cx('truncate font-medium', r.closed ? 'text-white/50' : 'text-white/85')}>{r.name}</span>
                {r.closed && <span className="text-[10.5px] text-white/35">closed</span>}
                <span className="truncate text-[10.5px] text-white/35">{r.model?.replace(/^claude-/, '')}</span>
                <span className="ml-auto font-mono text-white/70">{fmtUsd(r.today)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-sky-400 transition-[width] duration-700" style={{ width: `${(r.today / max) * 100}%` }} />
              </div>
            </div>
          ))}
          {!rows.length && <div className="py-4 text-center text-[12px] text-white/40">No Claude sessions yet.</div>}
        </div>
        {multi && usage?.byProfile && (
          <div className="mt-3 border-t border-white/[0.06] px-2 pt-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-0.5 text-[11.5px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint(p).color }} />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto font-mono">{fmtUsd(usage.byProfile?.[p.id]?.cost ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
        {byProject.length > 1 && (
          <div className="mt-3 border-t border-white/[0.06] px-2 pt-2">
            {byProject.map(({ p, n }) => (
              <div key={p?.id ?? '?'} className="flex items-center gap-2 py-0.5 text-[11.5px] text-white/60">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p?.color ?? '#888' }} />
                {p?.name ?? 'other'}
                <span className="ml-auto font-mono">{fmtUsd(n)}</span>
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
