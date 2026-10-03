import { AnimatePresence, motion } from 'motion/react'
import { Camera, Flag, FolderOpen, Loader2, MessageSquare, Rocket } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ShipFile } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { askPrompt } from '../lib/prompts'
import { cx, shellQuote } from '../lib/util'
import { findTile, useApp } from '../store/app'
import { Button, Field, inputCls, Modal, Segmented, Toggle } from './ui'

/* ---------- screenshot sets ---------- */

export function ShotSetSheet() {
  const { shotSet, set } = useApp()
  return (
    <Modal open={!!shotSet} onClose={() => set({ shotSet: null })} width={560}>
      {shotSet && <ShotBody sessionId={shotSet.sessionId} tileId={shotSet.tileId} />}
    </Modal>
  )
}

function ShotBody({ sessionId, tileId }: { sessionId: string; tileId: string }) {
  const { sessions, projects, previewWc, git, pages, set, toast } = useApp()
  const s = sessions[sessionId]
  const project = projects.find((p) => p.id === s?.projectId)
  const tile = findTile(pages, tileId)?.tile
  const [routes, setRoutes] = useState('/')
  const [width, setWidth] = useState(1440)
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')
  const [pr, setPr] = useState(git[s?.cwd ?? '']?.pr?.number ? String(git[s!.cwd]!.pr!.number) : '')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    orch.invoke('state:get').then((st) => {
      const prefs = st.shotSets?.[project.path]
      if (prefs) {
        setRoutes(prefs.routes.join('\n'))
        setWidth(prefs.width)
        setScheme(prefs.scheme)
      }
    })
  }, [project])

  const folder = `${orch.homedir}/Desktop/${(project?.name ?? 'project').replace(/[^\w.-]+/g, '-')}${pr ? `-pr-${pr}` : ''}-screenshots`
  const list = routes.split('\n').map((r) => r.trim()).filter(Boolean)
  const wcId = previewWc[sessionId]
  const base = (() => {
    try {
      return new URL(tile?.preview?.url || s?.url || '').origin
    } catch {
      return ''
    }
  })()

  const run = async () => {
    if (!wcId || !base) return toast('Open the preview on the dev server first', 'warn')
    if (project) orch.invoke('shots:remember', project.path, { routes: list, width, scheme })
    setBusy(`0 / ${list.length}`)
    const off = orch.on('shots:progress', (i, n) => setBusy(`${i} / ${n}`))
    try {
      const r = await orch.invoke('shots:capture', { wcId, base, routes: list, width, scheme, folder })
      toast(`Saved ${r.files.length} screenshots to ${r.folder.replace(orch.homedir, '~')}`, 'ok')
      set({ shotSet: null })
      orch.invoke('shell:reveal', r.files[0] ?? r.folder)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      off()
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2.5">
        <Camera size={16} className="text-violet-300" />
        <div>
          <div className="text-[16px] font-semibold tracking-tight">Screenshot set</div>
          <div className="text-[12px] text-white/45">Full-page, numbered captures of each route through this tile's preview (and its login).</div>
        </div>
      </div>
      <Field label="Routes" hint={<span className="normal-case tracking-normal text-white/30">one per line, on {base || 'the preview'}</span>}>
        <textarea value={routes} onChange={(e) => setRoutes(e.target.value)} rows={5} className={cx(inputCls, 'resize-none font-mono text-[12px] leading-relaxed')} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Width">
          <select value={width} onChange={(e) => setWidth(Number(e.target.value))} className={inputCls}>
            {[1440, 1280, 1024, 768, 390].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Theme">
          <Segmented id="shot-scheme" value={scheme} onChange={setScheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
        </Field>
        <Field label="PR #">
          <input value={pr} onChange={(e) => setPr(e.target.value.replace(/\D/g, ''))} placeholder="none" className={inputCls} />
        </Field>
      </div>
      <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] px-3 py-2 font-mono text-[11.5px] text-white/55">
        <FolderOpen size={13} /> {folder.replace(orch.homedir, '~')}/01-…-{width}.png
      </div>
      <div className="flex items-center justify-end gap-2">
        {busy && (
          <span className="mr-auto flex items-center gap-2 text-[12.5px] text-white/55">
            <Loader2 size={14} className="animate-spin" /> Capturing {busy}
          </span>
        )}
        <Button onClick={() => set({ shotSet: null })}>Cancel</Button>
        <Button tone="primary" disabled={!!busy || !list.length} onClick={run}>
          Capture {list.length}
        </Button>
      </div>
    </div>
  )
}

/* ---------- goals ---------- */

export function GoalSheet() {
  const { goalFor, set } = useApp()
  return (
    <Modal open={!!goalFor} onClose={() => set({ goalFor: null })} width={560}>
      {goalFor && <GoalBody id={goalFor} />}
    </Modal>
  )
}

function GoalBody({ id }: { id: string }) {
  const { sessions, set, toast } = useApp()
  const s = sessions[id]
  const [goal, setGoal] = useState('')
  const [stop, setStop] = useState('Every flow touched is tested and QA finds no new bugs')
  const [rounds, setRounds] = useState(5)
  const [qa, setQa] = useState(true)
  const start = async () => {
    if (!goal.trim()) return
    await orch.invoke('goal:start', id, { goal, stop, maxRounds: rounds, qa })
    toast(`${s?.name} is on round 1`, 'ok')
    set({ goalFor: null })
  }
  return (
    <div className="space-y-5 p-6" onKeyDown={(e) => e.key === 'Enter' && e.metaKey && start()}>
      <div className="flex items-center gap-2.5">
        <Flag size={16} className="text-fuchsia-300" />
        <div>
          <div className="text-[16px] font-semibold tracking-tight">Goal for {s?.name}</div>
          <div className="text-[12px] text-white/45">Runs in rounds. A QA session checks each finished round and sends problems back, up to the round cap.</div>
        </div>
      </div>
      <Field label="Goal">
        <textarea autoFocus value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} placeholder="Fix all the finders, then QA every flow they touch" className={cx(inputCls, 'resize-none leading-relaxed')} />
      </Field>
      <Field label="Stop when">
        <input value={stop} onChange={(e) => setStop(e.target.value)} className={inputCls} />
      </Field>
      <div className="flex items-center gap-6">
        <Field label="Max rounds">
          <input type="number" min={1} max={20} value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className={cx(inputCls, '!w-24')} />
        </Field>
        <div className="pt-5">
          <Toggle on={qa} onChange={setQa} label="QA session verifies each round" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => set({ goalFor: null })}>Cancel</Button>
        <Button tone="primary" disabled={!goal.trim()} onClick={start}>
          Start round 1 <kbd className="!bg-white/15 !text-white/80">⌘↵</kbd>
        </Button>
      </div>
    </div>
  )
}

/* ---------- ship ---------- */

export function ShipSheet() {
  const { shipFor, set } = useApp()
  return (
    <Modal open={!!shipFor} onClose={() => set({ shipFor: null })} width={620}>
      {shipFor && <ShipBody id={shipFor} />}
    </Modal>
  )
}

function ShipBody({ id }: { id: string }) {
  const { sessions, set, toast } = useApp()
  const s = sessions[id]
  const [plan, setPlan] = useState<{ files: ShipFile[]; branch?: string; upstream?: string; names: Record<string, string> } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [target, setTarget] = useState<'push' | 'staging' | 'prod' | 'staging and prod'>('push')
  const [targets, setTargets] = useState(false)

  useEffect(() => {
    orch.invoke('prompts:shipTargets', id).then(setTargets)
    orch.invoke('ship:plan', id).then((p) => {
      setPlan(p)
      setPicked(new Set(p.files.filter((f) => f.owner === 'mine').map((f) => f.path)))
    })
  }, [id])

  const others = useMemo(() => plan?.files.filter((f) => f.owner !== 'mine') ?? [], [plan])
  const toggle = (p: string) => setPicked((cur) => {
    const n = new Set(cur)
    if (n.has(p)) n.delete(p)
    else n.add(p)
    return n
  })

  const askOwner = (f: ShipFile) => {
    orch.invoke('bus:send', { to: f.owner, body: `${s?.name} is about to ship and ${f.path} has your changes in it. Is it ready to go out? Reply to ${s?.name} with send_message.`, wake: true })
    toast(`Asked ${plan?.names[f.owner] ?? 'the owner'} about ${f.path}`, 'ok')
  }

  const ship = () => {
    const files = [...picked]
    if (!files.length || !s) return
    for (const f of others.filter((f) => picked.has(f.path)))
      orch.invoke('bus:send', { to: f.owner, from: s.id, body: `Heads-up: I'm shipping ${f.path}, which includes your change.`, wake: false })
    askPrompt(s.id, 'ship', { files: files.map(shellQuote).join(' '), branch: plan?.branch ?? 'the current branch', target: target === 'push' || !targets ? '' : ` ${target}` })
    set({ shipFor: null })
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-6 pt-5 pb-4">
        <Rocket size={16} className="text-sky-300" />
        <div className="flex-1">
          <div className="text-[16px] font-semibold tracking-tight">Ship from {s?.name}</div>
          <div className="text-[12px] text-white/45">
            {plan ? `${plan.branch ?? '?'}${plan.upstream ? ` → ${plan.upstream}` : ' (no upstream yet)'}` : 'Reading the worktree…'}
          </div>
        </div>
        {targets && (
          <Segmented
            id="ship-target"
            value={target}
            onChange={setTarget}
            options={[
              { value: 'push', label: 'Push' },
              { value: 'staging', label: 'Staging' },
              { value: 'prod', label: 'Prod' },
              { value: 'staging and prod', label: 'Both' },
            ]}
          />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin px-6 py-4">
        {!plan && <div className="py-8 text-center text-[12.5px] text-white/40">…</div>}
        {plan && !plan.files.length && <div className="py-8 text-center text-[13px] text-white/45">Nothing changed in this worktree.</div>}
        <AnimatePresence initial={false}>
          {plan?.files.map((f) => (
            <motion.label
              key={f.path}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.snappy}
              className={cx('mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2', picked.has(f.path) ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]')}
            >
              <input type="checkbox" checked={picked.has(f.path)} onChange={() => toggle(f.path)} className="accent-violet-500" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/85">{f.path}</span>
              {f.owner === 'mine' ? (
                <span className="text-[11px] text-white/35">{f.why === 'touched' ? 'edited here' : 'unclaimed'}</span>
              ) : (
                <>
                  <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-[11px] text-amber-200">
                    {plan.names[f.owner] ?? 'other'} · {f.why}
                  </span>
                  <button type="button" onClick={(e) => (e.preventDefault(), askOwner(f))} className="no-drag rounded-lg p-1 text-white/45 hover:bg-white/10 hover:text-white" title="Ask the owner">
                    <MessageSquare size={13} />
                  </button>
                </>
              )}
            </motion.label>
          ))}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3 border-t border-white/[0.06] px-6 py-4">
        <span className="text-[12px] text-white/45">
          {picked.size} file{picked.size === 1 ? '' : 's'}
          {others.some((f) => picked.has(f.path)) ? ' · owners get a heads-up' : ''}
        </span>
        <div className="flex-1" />
        <Button onClick={() => set({ shipFor: null })}>Cancel</Button>
        <Button tone="primary" disabled={!picked.size} onClick={ship}>
          <Rocket size={13} /> {!targets ? 'Commit & push' : target === 'push' ? 'Ship' : `Ship to ${target}`}
        </Button>
      </div>
    </div>
  )
}
