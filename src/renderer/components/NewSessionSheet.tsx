import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Archive, FolderOpen, GitBranch, GitFork, History, Loader2, Sparkles, TerminalSquare } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { Adapter, PermissionMode, Role, TranscriptSummary, Worktree } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx, tildify, timeAgo } from '../lib/util'
import { useApp } from '../store/app'
import { HandoffList } from './HandoffList'
import { Button, Field, inputCls, Modal, Segmented } from './ui'

const ROLES: { value: Role; label: string }[] = [
  { value: 'plain', label: 'Plain' },
  { value: 'lead', label: 'Lead' },
  { value: 'worker', label: 'Worker' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'qa', label: 'QA' },
  { value: 'docs', label: 'Docs' },
]

export function NewSessionSheet() {
  const { newSession, set } = useApp()
  return (
    <Modal open={!!newSession} onClose={() => set({ newSession: null })} width={680} align="top">
      {newSession && <SheetBody key={`${newSession.projectPath}-${newSession.mode}`} />}
    </Modal>
  )
}

function SheetBody() {
  const { newSession, projects, sessions, set, spawn, toast, settings, handoffCounts } = useApp()
  const [projectPath, setProjectPath] = useState(newSession?.projectPath ?? projects[0]?.path ?? '')
  const [mode, setMode] = useState<'checkout' | 'worktree' | 'resume' | 'pickup'>(newSession?.mode ?? 'checkout')
  const [kind, setKind] = useState<'claude' | 'shell'>(newSession?.kind ?? 'claude')
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [cwd, setCwd] = useState(projectPath)
  const [branch, setBranch] = useState('')
  const [base, setBase] = useState('')
  const [bases, setBases] = useState<string[]>([])
  const [adapter, setAdapter] = useState<Adapter | null>(null)
  const [transcripts, setTranscripts] = useState<TranscriptSummary[]>([])
  const [role, setRole] = useState<Role>('plain')
  const [model, setModel] = useState(settings.defaultModel)
  const [perm, setPerm] = useState<PermissionMode>(settings.defaultPermissionMode)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (!projectPath) return
    orch.invoke('worktree:list', projectPath).then((w) => {
      setWorktrees(w)
      if (w.length && !w.some((x) => x.path === cwd)) setCwd(w[0].path)
      if (!w.length) setCwd(projectPath)
    })
    orch.invoke('git:branches', projectPath).then((b) => {
      setBases(b)
      setBase((cur) => cur || ['origin/develop', 'origin/main', 'origin/master', 'main', 'master'].find((x) => b.includes(x)) || b[0] || 'HEAD')
    })
    orch.invoke('adapter:get', projectPath).then(setAdapter)
    orch.invoke('transcripts:list', projectPath).then(setTranscripts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath])

  const live = Object.values(sessions).filter((s) => s.kind === 'claude' && s.status !== 'exited')
  const inUse = (p: string) => live.filter((s) => s.cwd === p)
  const conflict = kind === 'claude' && mode === 'checkout' && role !== 'reviewer' ? inUse(cwd) : []
  const isGit = worktrees.length > 0

  const projectOptions = useMemo(() => {
    const list = [...projects].sort((a, b) => b.lastOpened - a.lastOpened)
    if (projectPath && !list.some((p) => p.path === projectPath)) list.unshift({ id: 'x', path: projectPath, name: projectPath.split('/').pop()!, color: '', pinned: false, lastOpened: 0 })
    return list
  }, [projects, projectPath])

  const start = async (override?: Partial<{ role: Role; perm: PermissionMode }>) => {
    if (!projectPath) return
    let target = cwd
    try {
      if (mode === 'worktree') {
        if (!branch.trim()) return toast('Name the new branch first', 'warn')
        setBusy(adapter?.worktree?.create ? `Running ${adapter.name ?? 'project'} worktree script…` : 'Creating worktree…')
        const wt = await orch.invoke('worktree:create', { projectPath, branch: branch.trim(), base })
        target = wt.path
        toast(`Worktree ${wt.branch}${wt.ports ? ` on :${wt.ports.web} / :${wt.ports.api}` : ''}`, 'ok')
      }
      setBusy('Starting…')
      const finalRole = override?.role ?? role
      if (mode === 'resume' || mode === 'pickup') return
      await spawn({
        kind,
        projectPath,
        cwd: target,
        name: name || undefined,
        role: kind === 'claude' ? finalRole : 'plain',
        model: model || undefined,
        permissionMode: override?.perm ?? (finalRole === 'reviewer' ? 'plan' : perm),
        prompt: prompt.trim() || undefined,
      })
      set({ newSession: null })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const resume = async (t: TranscriptSummary) => {
    setBusy('Resuming…')
    await spawn({ kind: 'claude', projectPath, cwd: t.cwd, resumeFrom: t.id, role, model: model || undefined })
    setBusy(null)
    set({ newSession: null })
  }

  return (
    <div
      className="flex max-h-[82vh] flex-col"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.metaKey) start()
      }}
    >
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-6 pt-5 pb-4">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-400/40 to-sky-400/30 ring-1 ring-white/10">
          <Sparkles size={16} className="text-white" />
        </div>
        <div className="flex-1">
          <div className="text-[16px] font-semibold tracking-tight">New session</div>
          <div className="text-[12px] text-white/45">The real Claude Code CLI, wired into the bus.</div>
        </div>
        <Segmented
          id="kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'claude', label: <span className="flex items-center gap-1.5"><Sparkles size={12} /> Claude</span> },
            { value: 'shell', label: <span className="flex items-center gap-1.5"><TerminalSquare size={12} /> Shell</span> },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto scroll-thin px-6 py-5">
        <Field label="Project">
          <div className="flex gap-2">
            <select value={projectPath} onChange={(e) => setProjectPath(e.target.value)} className={inputCls}>
              {projectOptions.map((p) => (
                <option key={p.path} value={p.path}>
                  {p.name} — {tildify(p.path, orch.homedir)}
                </option>
              ))}
            </select>
            <Button
              tone="soft"
              onClick={async () => {
                const p = await orch.invoke('dialog:openFolder')
                if (p) setProjectPath(p)
              }}
            >
              <FolderOpen size={14} />
            </Button>
          </div>
        </Field>

        <div>
          <Segmented
            id="mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'checkout', label: <span className="flex items-center gap-1.5"><GitBranch size={12} /> Existing checkout</span> },
              ...(isGit ? [{ value: 'worktree' as const, label: <span className="flex items-center gap-1.5"><GitFork size={12} /> New worktree</span> }] : []),
              ...(kind === 'claude' ? [{ value: 'resume' as const, label: <span className="flex items-center gap-1.5"><History size={12} /> Resume</span> }] : []),
              ...(kind === 'claude'
                ? [
                    {
                      value: 'pickup' as const,
                      label: (
                        <span className="flex items-center gap-1.5">
                          <Archive size={12} /> Pick up
                          {handoffCounts[projectPath] ? <span className="rounded-full bg-violet-400/25 px-1.5 text-[10px] text-violet-100">{handoffCounts[projectPath]}</span> : null}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring.snappy}>
            {mode === 'checkout' && (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {(worktrees.length ? worktrees : [{ path: projectPath, branch: '', head: '', isPrimary: true, ports: null }]).map((w) => {
                  const users = inUse(w.path)
                  return (
                    <motion.button
                      key={w.path}
                      layout
                      onClick={() => setCwd(w.path)}
                      whileTap={{ scale: 0.98 }}
                      className={cx(
                        'no-drag flex items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors',
                        cwd === w.path ? 'border-violet-400/50 bg-violet-500/10' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]',
                      )}
                    >
                      <GitBranch size={14} className="text-white/40" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[13px] font-medium">
                          {w.branch || 'working directory'}
                          {w.isPrimary && worktrees.length > 1 && <span className="rounded bg-white/[0.07] px-1.5 text-[10px] text-white/50">primary</span>}
                        </div>
                        <div className="truncate font-mono text-[11px] text-white/35">{tildify(w.path, orch.homedir)}</div>
                      </div>
                      {w.ports && <span className="font-mono text-[11px] text-emerald-300/70">:{w.ports.web} :{w.ports.api}</span>}
                      {users.length > 0 && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">{users.map((u) => u.name).join(', ')}</span>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            )}

            {mode === 'worktree' && (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_200px] gap-3">
                  <Field label="New branch">
                    <input autoFocus value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="feat/checkout-flow" className={inputCls} />
                  </Field>
                  <Field label="Off">
                    <select value={base} onChange={(e) => setBase(e.target.value)} className={inputCls}>
                      {bases.slice(0, 60).map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] leading-relaxed text-white/50">
                  {adapter?.worktree?.create ? (
                    <>
                      Uses the <b className="text-white/75">{adapter.name}</b> adapter: <code className="font-mono text-[11px] text-white/65">{adapter.worktree.create}</code>. Colliding ports get moved to a free pair.
                    </>
                  ) : (
                    <>Creates a sibling worktree, reserves a port pair, copies .env with the ports rewritten and links HANDOFF.md to the primary's.</>
                  )}
                </div>
              </div>
            )}

            {mode === 'pickup' && <HandoffList projectPath={projectPath} onPicked={() => set({ newSession: null })} />}

            {mode === 'resume' && (
              <div className="grid max-h-72 grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto scroll-thin">
                {transcripts.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => resume(t)}
                    className="no-drag rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                  >
                    <div className="line-clamp-1 text-[12.5px] text-white/85">{t.firstPrompt}</div>
                    <div className="mt-0.5 flex gap-2 font-mono text-[10.5px] text-white/35">
                      <span>{timeAgo(t.mtime)}</span>
                      <span className="truncate">{tildify(t.cwd, orch.homedir)}</span>
                    </div>
                  </button>
                ))}
                {!transcripts.length && <div className="py-6 text-center text-[12.5px] text-white/40">No past sessions for this project.</div>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence>
          {conflict.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring.snappy}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-amber-300/25 bg-amber-400/[0.07] p-3.5">
                <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-amber-100">
                  <AlertTriangle size={14} /> One checkout, one session
                </div>
                <div className="mb-3 text-[12.5px] leading-relaxed text-amber-100/70">
                  {conflict.map((c) => c.name).join(', ')} already works here. Two sessions in one checkout flip branches under each other and sweep each other's files into commits.
                </div>
                <div className="flex flex-wrap gap-2">
                  {isGit && (
                    <Button tone="primary" size="sm" onClick={() => setMode('worktree')}>
                      <GitFork size={12} /> Use a new worktree
                    </Button>
                  )}
                  <Button tone="soft" size="sm" onClick={() => start({ role: 'reviewer', perm: 'plan' })}>
                    Open as read-only reviewer
                  </Button>
                  <Button tone="ghost" size="sm" onClick={() => start()}>
                    Start anyway
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {kind === 'claude' && mode !== 'resume' && mode !== 'pickup' && (
          <>
            <Field label="Role">
              <Segmented id="role" value={role} onChange={setRole} options={ROLES} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="auto" className={inputCls} />
              </Field>
              <Field label="Model">
                <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
                  <option value="">Default</option>
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                  <option value="fable">Fable</option>
                </select>
              </Field>
              <Field label="Permissions">
                <select value={perm} onChange={(e) => setPerm(e.target.value as PermissionMode)} className={inputCls}>
                  <option value="default">Default</option>
                  <option value="auto">Auto</option>
                  <option value="acceptEdits">Accept edits</option>
                  <option value="plan">Plan mode</option>
                  <option value="bypassPermissions">Bypass (careful)</option>
                </select>
              </Field>
            </div>
            <Field label="First prompt" hint={<span className="normal-case tracking-normal text-white/30">optional</span>}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="What should this session do?"
                className={cx(inputCls, 'resize-none leading-relaxed')}
              />
            </Field>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-white/[0.06] px-6 py-4">
        <AnimatePresence>
          {busy && (
            <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-[12.5px] text-white/55">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </motion.span>
          )}
        </AnimatePresence>
        <div className="flex-1" />
        <Button onClick={() => set({ newSession: null })}>Cancel</Button>
        {mode !== 'resume' && mode !== 'pickup' && (
          <Button tone="primary" disabled={!!busy || (conflict.length > 0 && mode === 'checkout')} onClick={() => start()}>
            {mode === 'worktree' ? 'Create worktree & start' : 'Start session'} <kbd className="!bg-white/15 !text-white/80">⌘↵</kbd>
          </Button>
        )}
      </div>
    </div>
  )
}
