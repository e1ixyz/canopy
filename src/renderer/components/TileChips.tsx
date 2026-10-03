import { Check, Flag, Loader2, RotateCw, Square, X } from 'lucide-react'
import { useState } from 'react'
import type { Session } from '@shared/types'
import { orch } from '../lib/orch'
import { submitPrompt } from '../lib/terms'
import { cx, timeAgo } from '../lib/util'
import { useApp } from '../store/app'
import { Button, Popover } from './ui'

export function prettyModel(m?: string) {
  if (!m) return 'model'
  const x = /(opus|sonnet|haiku|fable)[-_ ]?(\d+)?[-.]?(\d+)?/i.exec(m)
  if (!x) return m
  const name = x[1][0].toUpperCase() + x[1].slice(1).toLowerCase()
  return x[2] ? `${name} ${x[2]}${x[3] && x[3].length < 3 ? `.${x[3]}` : ''}` : name
}

const MODES: Record<string, string> = {
  default: 'manual',
  acceptEdits: 'accept edits',
  plan: 'plan',
  auto: 'auto',
  bypassPermissions: 'bypass',
}

const chip =
  'no-drag flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] font-medium whitespace-nowrap transition-colors bg-white/[0.05] text-white/60 hover:bg-white/[0.1] hover:text-white'

function Menu({ items, onPick }: { items: { value: string; label: string; active?: boolean }[]; onPick: (v: string) => void }) {
  return (
    <div className="space-y-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => onPick(i.value)}
          className={cx('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px]', i.active ? 'bg-white/[0.08] text-white' : 'text-white/75 hover:bg-white/[0.06]')}
        >
          <span className="flex-1">{i.label}</span>
          {i.active && <Check size={12} />}
        </button>
      ))}
    </div>
  )
}

/** Model, effort and permission-mode chips; each change is the matching Claude Code command */
export function ModeChips({ s, compact }: { s: Session; compact: boolean }) {
  const [open, setOpen] = useState<'model' | 'effort' | null>(null)
  if (s.kind !== 'claude') return null
  const mode = s.permissionMode ?? 'default'
  return (
    <div className="flex items-center gap-1" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <button className={chip} title="Model (/model)" onClick={() => setOpen(open === 'model' ? null : 'model')}>
          {prettyModel(s.model)}
        </button>
        <Popover open={open === 'model'} onClose={() => setOpen(null)} width={180} align="left">
          <Menu
            items={['opus', 'sonnet', 'haiku', 'fable'].map((m) => ({ value: m, label: prettyModel(m), active: prettyModel(s.model).toLowerCase().startsWith(m) }))}
            onPick={(m) => {
              submitPrompt(s.id, `/model ${m}`)
              setOpen(null)
            }}
          />
        </Popover>
      </div>
      {!compact && (
        <div className="relative">
          <button className={chip} title="Effort (/effort)" onClick={() => setOpen(open === 'effort' ? null : 'effort')}>
            {s.effort ?? 'effort'}
          </button>
          <Popover open={open === 'effort'} onClose={() => setOpen(null)} width={160} align="left">
            <Menu
              items={['low', 'medium', 'high', 'max'].map((e) => ({ value: e, label: e, active: s.effort === e }))}
              onPick={(e) => {
                submitPrompt(s.id, `/effort ${e}`)
                orch.invoke('session:setMeta', s.id, { effort: e })
                setOpen(null)
              }}
            />
          </Popover>
        </div>
      )}
      <button
        className={cx(chip, mode === 'plan' && '!bg-sky-400/15 !text-sky-200', mode === 'bypassPermissions' && '!bg-rose-400/15 !text-rose-200', (mode === 'acceptEdits' || mode === 'auto') && '!bg-amber-400/12 !text-amber-200')}
        title="Permission mode: click to cycle (shift+tab)"
        onClick={() => orch.send('pty:write', s.id, '\x1b[Z')}
      >
        {MODES[mode] ?? mode}
      </button>
    </div>
  )
}

/** The project's ratchet badge (etwal: ds:check), rerun after each turn */
export function BadgeChip({ s }: { s: Session }) {
  const [open, setOpen] = useState(false)
  const b = s.badge
  if (!b) return null
  return (
    <div className="relative" onDoubleClick={(e) => e.stopPropagation()}>
      <button
        title={`${b.label}: ${b.ok ? 'passing' : 'failing'}`}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'no-drag flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] font-bold',
          b.running ? 'bg-white/[0.06] text-white/55' : b.ok ? 'bg-emerald-400/15 text-emerald-200' : 'bg-rose-500/20 text-rose-200',
        )}
      >
        {b.running ? <Loader2 size={11} className="animate-spin" /> : b.ok ? <Check size={11} /> : <X size={11} />}
        {b.label}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={460}>
        <div className="flex items-center gap-2 px-2 pt-1 pb-2">
          <div className="text-[13px] font-semibold">{b.label}</div>
          <span className={cx('text-[11.5px]', b.ok ? 'text-emerald-300' : 'text-rose-300')}>{b.ok ? 'passing' : 'failing'}</span>
          <span className="text-[11px] text-white/35">{b.at ? timeAgo(b.at) : ''}</span>
          <span className="flex-1" />
          <Button size="sm" tone="soft" onClick={() => orch.invoke('badge:run', s.id)}>
            <RotateCw size={12} /> Re-run
          </Button>
        </div>
        <pre className="max-h-72 overflow-auto scroll-thin rounded-xl bg-black/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-white/70 select-text">
          {b.out.trim() || '(no output)'}
        </pre>
      </Popover>
    </div>
  )
}

export function GoalChip({ s }: { s: Session }) {
  const [open, setOpen] = useState(false)
  const g = s.goal
  if (!g) return null
  const live = g.status === 'running' || g.status === 'verifying'
  return (
    <div className="relative" onDoubleClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={g.goal}
        className={cx(
          'no-drag flex h-6 items-center gap-1 rounded-md px-1.5 text-[10.5px] font-semibold',
          g.status === 'met' ? 'bg-emerald-400/15 text-emerald-200' : g.status === 'stopped' ? 'bg-white/[0.06] text-white/50' : 'bg-fuchsia-400/15 text-fuchsia-200',
        )}
      >
        {g.status === 'verifying' ? <Loader2 size={11} className="animate-spin" /> : <Flag size={11} />}
        {g.status === 'met' ? 'goal met' : g.status === 'stopped' ? 'goal stopped' : `${g.status === 'verifying' ? 'QA' : 'round'} ${g.round}/${g.maxRounds}`}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} width={400}>
        <div className="px-2 pt-1">
          <div className="text-[13px] font-semibold">{g.goal}</div>
          <div className="mt-0.5 text-[11.5px] text-white/45">Stop when: {g.stop}</div>
        </div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto scroll-thin px-2">
          {g.history.map((h) => (
            <div key={h.round} className="rounded-xl bg-white/[0.04] p-2.5">
              <div className="flex items-center gap-2 text-[11px] text-white/45">
                Round {h.round}
                {h.verdict && <span className={h.verdict.clean ? 'text-emerald-300' : 'text-amber-300'}>{h.verdict.clean ? 'QA: clean' : 'QA: problems'}</span>}
              </div>
              <div className="mt-1 text-[12px] leading-relaxed whitespace-pre-wrap text-white/80 select-text">{h.summary}</div>
              {h.verdict && !h.verdict.clean && <div className="mt-1.5 text-[11.5px] whitespace-pre-wrap text-amber-100/70 select-text">{h.verdict.findings}</div>}
            </div>
          ))}
          {!g.history.length && <div className="py-3 text-center text-[12px] text-white/40">Round 1 is under way.</div>}
        </div>
        {live && (
          <div className="mt-3 flex justify-end border-t border-white/[0.06] px-1 pt-2">
            <Button size="sm" tone="danger" onClick={() => orch.invoke('goal:stop', s.id)}>
              <Square size={11} /> Stop goal
            </Button>
          </div>
        )}
      </Popover>
    </div>
  )
}

export function useFreshHandoff() {
  return (s: Session) => {
    orch.invoke('handoff:toNew', s.id)
    useApp.getState().toast('Writing a handoff; a fresh session will take over this tile', 'info')
  }
}
