import { AnimatePresence, motion } from 'motion/react'
import { FolderOpen, GitBranch, Loader2, Megaphone, Play, RefreshCw, Sparkles, Stethoscope, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_PROMPTS, PROMPT_INFO, PROMPT_KEYS, type PromptKey } from '@shared/prompts'
import type { Adapter, GitStatus, Worktree } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { submitPrompt } from '../lib/terms'
import { APPEARANCES } from '../lib/theme'
import { cx, tildify } from '../lib/util'
import { findTile, useApp } from '../store/app'
import { Button, Field, inputCls, Modal, Segmented, Toggle } from './ui'
import { ProfileSettings } from './Profiles'

export function SettingsPanel() {
  const { settingsOpen, set, settings, updateSettings } = useApp()
  return (
    <Modal open={settingsOpen} onClose={() => set({ settingsOpen: false })} width={560}>
      <div className="scroll-thin max-h-[82vh] space-y-6 overflow-y-auto p-6">
        <div>
          <div className="text-[16px] font-semibold tracking-tight">Settings</div>
          <div className="text-[12px] text-white/45">Look and feel, plus defaults for new sessions and bus traffic.</div>
        </div>
        <AppearanceSettings />
        <ProfileSettings />
        <Field label="File claims">
          <Segmented
            id="claims"
            value={settings.claimMode}
            onChange={(v) => updateSettings({ claimMode: v })}
            options={[
              { value: 'warn', label: 'Ask before editing' },
              { value: 'deny', label: 'Block edits' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <div className="mt-1.5 text-[11.5px] text-white/40">What happens when a session edits a file another session has claimed.</div>
        </Field>
        <div className="space-y-3">
          <Toggle
            on={settings.autoWake}
            onChange={(v) => updateSettings({ autoWake: v })}
            label="Deliver bus messages immediately (wake idle sessions, interrupt finished turns)"
          />
          <Toggle on={settings.notifications} onChange={(v) => updateSettings({ notifications: v })} label="macOS notifications when a session needs you" />
          <Toggle on={settings.reduceMotion} onChange={(v) => updateSettings({ reduceMotion: v })} label="Reduce motion" />
          <Toggle
            on={settings.nameWorktrees !== false}
            onChange={(v) => updateSettings({ nameWorktrees: v })}
            label="Name new worktrees from the first prompt when the branch is left empty"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Default model">
            <select value={settings.defaultModel} onChange={(e) => updateSettings({ defaultModel: e.target.value })} className={inputCls}>
              <option value="">Claude Code default</option>
              <option value="opus">Opus</option>
              <option value="sonnet">Sonnet</option>
              <option value="haiku">Haiku</option>
              <option value="fable">Fable</option>
            </select>
          </Field>
          <Field label="Default permissions">
            <select value={settings.defaultPermissionMode} onChange={(e) => updateSettings({ defaultPermissionMode: e.target.value as never })} className={inputCls}>
              <option value="default">Default</option>
              <option value="auto">Auto</option>
              <option value="acceptEdits">Accept edits</option>
              <option value="plan">Plan mode</option>
            </select>
          </Field>
        </div>
        <HostSettings />
        <PromptSettings />
        <UpdateSettings />
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
          <div className="flex-1 text-[12px] text-white/50">
            Adapters teach the app a repo's scripts, ports and prompts. Put them in <span className="font-mono text-white/70">~/.orchestrator/adapters</span>, or a repo's own <span className="font-mono text-white/70">.orchestrator.json</span>.
          </div>
          <Button size="sm" onClick={() => orch.invoke('adapters:openFolder')}>
            <FolderOpen size={12} /> Open folder
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function UpdateSettings() {
  const { update, checkForUpdates } = useApp()
  const [busy, setBusy] = useState(false)
  if (!update?.enabled) return null
  const check = async () => {
    setBusy(true)
    await checkForUpdates().finally(() => setBusy(false))
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <div className="flex-1 text-[12px] text-white/50">
        Built from <span className="font-mono text-white/70">{update.built}</span>. Canopy checks GitHub every hour and offers new commits on main.
      </div>
      <Button size="sm" onClick={check} disabled={busy || update.phase === 'building'}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Check now
      </Button>
    </div>
  )
}

function AppearanceSettings() {
  const { settings, updateSettings } = useApp()
  return (
    <Field label="Appearance">
      <Segmented id="appearance" value={settings.appearance ?? 'system'} onChange={(v) => updateSettings({ appearance: v })} options={APPEARANCES} />
    </Field>
  )
}

/** Hosts beyond ~/.ssh/config, kept in app settings (the app never edits your ssh config) */
function HostSettings() {
  const { settings, updateSettings } = useApp()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [fromConfig, setFromConfig] = useState<string[]>([])
  useEffect(() => {
    orch.invoke('hosts:list').then((h) => setFromConfig(h.filter((x) => x.source === 'ssh-config').map((x) => x.name)))
  }, [])
  const hosts = settings.hosts ?? []
  const add = () => {
    if (!name.trim()) return
    updateSettings({ hosts: [...hosts.filter((h) => h.name !== name.trim()), { name: name.trim(), target: target.trim() || undefined, source: 'app' }] })
    setName('')
    setTarget('')
  }
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-white/45 uppercase">SSH hosts</div>
      <div className="mb-2 text-[11.5px] text-white/40">
        {fromConfig.length ? `From ~/.ssh/config: ${fromConfig.join(', ')}. ` : ''}Add others here; the target is what follows ssh.
      </div>
      <div className="space-y-1">
        {hosts.map((h) => (
          <div key={h.name} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12.5px]">
            <span className="text-white/85">{h.name}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/40">{h.target ?? h.name}</span>
            <button type="button" onClick={() => updateSettings({ hosts: hosts.filter((x) => x.name !== h.name) })} className="no-drag rounded-md p-1 text-white/40 hover:bg-rose-500/15 hover:text-rose-200">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="mac-studio" className={cx(inputCls, 'flex-[0_0_9rem]')} />
          <input value={target} onChange={(e) => setTarget(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="admin@mac-studio.local -i ~/.ssh/mac_studio" className={cx(inputCls, 'min-w-0 flex-1 font-mono text-[12px]')} />
          <Button tone="soft" onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Edits a local draft and saves after a pause (or on blur), so typing never waits on the settings IPC round trip */
function PromptEditor({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const saved = useRef(value)
  const save = (v: string) => {
    if (v === saved.current) return
    saved.current = v
    onSave(v)
  }
  useEffect(() => {
    const t = setTimeout(() => save(draft), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => save(draft)}
      placeholder={placeholder}
      rows={5}
      className={cx(inputCls, 'resize-y font-mono text-[11.5px] leading-relaxed')}
    />
  )
}

/** One textarea per app prompt; empty means the default (shown as the placeholder) */
function PromptSettings() {
  const { settings, updateSettings } = useApp()
  const [open, setOpen] = useState<PromptKey | null>(null)
  const set = (k: PromptKey, v: string) => updateSettings({ prompts: { ...settings.prompts, [k]: v || undefined } })
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold tracking-wider text-white/45 uppercase">Prompts</div>
      <div className="mb-2 text-[11.5px] text-white/40">What the app types into sessions. Point one at your own skill (for example /ship{'{target}'}) or leave it empty for the default.</div>
      <div className="space-y-1">
        {PROMPT_KEYS.map((k) => {
          const custom = !!settings.prompts?.[k]?.trim()
          return (
            <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.02]">
              <button type="button" onClick={() => setOpen(open === k ? null : k)} className="no-drag flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-white/80">
                <span className="flex-1">{PROMPT_INFO[k].label}</span>
                {custom && <span className="rounded-md bg-violet-400/15 px-1.5 py-0.5 text-[10.5px] text-violet-200">custom</span>}
                {PROMPT_INFO[k].vars && <span className="font-mono text-[10.5px] text-white/30">{PROMPT_INFO[k].vars}</span>}
              </button>
              {open === k && (
                <div className="px-3 pb-3">
                  <PromptEditor key={k} value={settings.prompts?.[k] ?? ''} placeholder={DEFAULT_PROMPTS[k]} onSave={(v) => set(k, v)} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function BroadcastSheet() {
  const { broadcastOpen, set, selected, pages, sessions, toast, clearSelection } = useApp()
  const [text, setText] = useState('')
  const targets = selected.map((id) => findTile(pages, id)).filter(Boolean).map((h) => sessions[h!.tile.sessionId]).filter(Boolean)
  const list = targets.length ? targets : Object.values(sessions).filter((s) => s.kind === 'claude' && s.status === 'idle')
  const send = () => {
    if (!text.trim()) return
    if (!list.length) return toast('No sessions to send to: select tiles, or wait for one to be idle', 'warn')
    for (const s of list) submitPrompt(s.id, text.trim())
    toast(`Prompt sent to ${list.length} session(s)`, 'ok')
    setText('')
    clearSelection()
    set({ broadcastOpen: false })
  }
  return (
    <Modal open={broadcastOpen} onClose={() => set({ broadcastOpen: false })} width={560}>
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-amber-300" />
          <div className="text-[16px] font-semibold tracking-tight">Broadcast a prompt</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {list.map((s) => (
            <span key={s.id} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-[11.5px] text-white/75">
              {s.name}
            </span>
          ))}
          {!list.length && <span className="text-[12px] text-white/40">No idle sessions. ⇧-click tile headers to pick targets.</span>}
        </div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && e.metaKey && send()}
          rows={5}
          placeholder="Typed into each session's prompt and submitted, as if you did it yourself."
          className={cx(inputCls, 'resize-none leading-relaxed')}
        />
        <div className="flex justify-end gap-2">
          <Button onClick={() => set({ broadcastOpen: false })}>Cancel</Button>
          <Button tone="primary" disabled={!list.length} onClick={send}>
            Send to {list.length} <kbd>⌘↵</kbd>
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function WorktreesPanel() {
  const { worktreesOpen, set, projects, sessions } = useApp()
  const live = projects.filter((p) => Object.values(sessions).some((s) => s.projectId === p.id))
  const [projectPath, setProjectPath] = useState('')
  useEffect(() => {
    if (worktreesOpen && !projectPath) setProjectPath(live[0]?.path ?? projects[0]?.path ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreesOpen])
  return (
    <Modal open={worktreesOpen} onClose={() => set({ worktreesOpen: false })} width={760}>
      {worktreesOpen && projectPath && <WorktreesBody projectPath={projectPath} setProjectPath={setProjectPath} />}
    </Modal>
  )
}

function WorktreesBody({ projectPath, setProjectPath }: { projectPath: string; setProjectPath: (p: string) => void }) {
  const { projects, sessions, set, spawn, toast } = useApp()
  const [wts, setWts] = useState<Worktree[]>([])
  const [git, setGit] = useState<Record<string, GitStatus | null>>({})
  const [adapter, setAdapter] = useState<Adapter | null>(null)
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await orch.invoke('worktree:list', projectPath)
      setWts(list)
      setAdapter(await orch.invoke('adapter:get', projectPath))
      const g: Record<string, GitStatus | null> = {}
      await Promise.all(list.map(async (w) => (g[w.path] = await orch.invoke('git:status', w.path).catch(() => null))))
      setGit(g)
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  const remove = async (w: Worktree, force = false) => {
    // Sessions inside the worktree would lose their cwd mid-run, so ask first.
    const inside = Object.values(useApp.getState().sessions).filter((x) => x.cwd === w.path || x.cwd.startsWith(w.path + '/'))
    // The main process stops them only once removal goes ahead (after its uncommitted-work check).
    if (!force && inside.length && !confirm(`${inside.map((x) => x.name).join(', ')} ${inside.length === 1 ? 'is' : 'are'} running in ${w.branch}. Stop ${inside.length === 1 ? 'it' : 'them'} and remove the worktree?`)) return
    setRemoving(w.path)
    try {
      const r = await orch.invoke('worktree:remove', w.path, force)
      if (!r.ok) {
        if (r.reason && !force && confirm(`${w.branch}: ${r.reason}.\n\nRemove it anyway? Uncommitted work is lost.`)) return remove(w, true)
        if (r.reason) toast(r.reason, 'warn')
      } else toast(`Removed ${w.branch}`, 'ok')
      await load()
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setRemoving(null)
    }
  }

  const runScript = async (cmd: string, name: string) => {
    const s = await orch.invoke('shell:run', projectPath, projectPath, cmd, name)
    useApp.getState().addTile(s.id)
    set({ worktreesOpen: false })
  }

  return (
    <div className="flex max-h-[80vh] flex-col">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 pt-5 pb-4">
        <div className="flex-1">
          <div className="text-[16px] font-semibold tracking-tight">Worktrees & ports</div>
          <div className="text-[12px] text-white/45">
            {adapter ? (
              <>
                Using the <b className="text-white/70">{adapter.name}</b> adapter
              </>
            ) : (
              'Built-in protocol: sibling worktrees, reserved port pairs, shared HANDOFF.md'
            )}
          </div>
        </div>
        <select value={projectPath} onChange={(e) => setProjectPath(e.target.value)} className={cx(inputCls, '!w-56')}>
          {projects.map((p) => (
            <option key={p.id} value={p.path}>
              {p.name}
            </option>
          ))}
        </select>
        <Button tone="soft" onClick={load}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto scroll-thin p-4">
        <AnimatePresence initial={false}>
          {wts.map((w, i) => {
            const g = git[w.path]
            const users = Object.values(sessions).filter((s) => s.cwd === w.path && s.status !== 'exited')
            return (
              <motion.div
                key={w.path}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -30, height: 0 }}
                transition={{ ...spring.bouncy, delay: i * 0.03 }}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5"
              >
                <div className="flex items-center gap-3">
                  <GitBranch size={15} className="text-white/40" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[13.5px] font-semibold">
                      {w.branch}
                      {w.isPrimary && <span className="rounded bg-white/[0.08] px-1.5 text-[10px] font-medium text-white/55">primary</span>}
                      {g && g.dirty > 0 && <span className="text-[11px] font-normal text-sky-300/80">● {g.dirty} changed</span>}
                      {g && g.ahead > 0 && <span className="text-[11px] font-normal text-emerald-300/80">↑{g.ahead}</span>}
                      {g && g.behind > 0 && <span className="text-[11px] font-normal text-amber-300/80">↓{g.behind}</span>}
                    </div>
                    <div className="truncate font-mono text-[11px] text-white/35">{tildify(w.path, orch.homedir)}</div>
                  </div>
                  {w.ports && (
                    <span className="rounded-lg bg-emerald-400/10 px-2 py-1 font-mono text-[11px] text-emerald-200/80">
                      web :{w.ports.web} · api :{w.ports.api}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {users.map((u) => (
                    <span key={u.id} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/65">
                      {u.name} · {u.status}
                    </span>
                  ))}
                  <span className="flex-1" />
                  <Button size="sm" tone="soft" onClick={() => spawn({ kind: 'claude', projectPath, cwd: w.path }).then(() => set({ worktreesOpen: false }))}>
                    <Sparkles size={12} /> Session here
                  </Button>
                  <Button
                    size="sm"
                    tone="soft"
                    onClick={() =>
                      orch
                        .invoke('dev:start', w.path, projectPath)
                        .then(() => toast(`Dev server starting in ${w.branch}`, 'ok'))
                        .catch((e) => toast(e.message, 'error'))
                    }
                  >
                    <Play size={12} /> Dev server
                  </Button>
                  <Button size="sm" onClick={() => orch.invoke('shell:reveal', w.path)}>
                    <FolderOpen size={12} />
                  </Button>
                  {!w.isPrimary && (
                    <Button size="sm" tone="danger" disabled={removing === w.path} onClick={() => remove(w)}>
                      {removing === w.path ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Remove
                    </Button>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {!wts.length && !loading && <div className="py-12 text-center text-[13px] text-white/40">Not a git repository.</div>}
      </div>
      {adapter?.worktree && (
        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] px-6 py-3">
          {adapter.worktree.preflight && (
            <Button size="sm" tone="soft" onClick={() => runScript(fillPrimary(adapter.worktree!.preflight!, adapter), 'preflight')}>
              <Stethoscope size={12} /> Preflight
            </Button>
          )}
          {adapter.worktree.status && (
            <Button size="sm" tone="soft" onClick={() => runScript(fillPrimary(adapter.worktree!.status!.replace(' --here', ''), adapter), 'wt-status')}>
              <GitBranch size={12} /> Port status
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

const fillPrimary = (cmd: string, a: Adapter) => cmd.replace(/\{primary\}/g, a.primary ?? '')
