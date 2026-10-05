import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'
import * as pty from 'node-pty'
import { nativeTheme } from 'electron'
import type { EventMap } from '@shared/ipc'
import {
  PROJECT_COLORS,
  type Adapter,
  type AppState,
  type AdapterAction,
  type BusMessage,
  type HandoffMeta,
  type PortPair,
  type PortsSnapshot,
  type Project,
  type Role,
  type Session,
  type SpawnRequest,
  type TileTarget,
  type UsageSnapshot,
} from '@shared/types'
import { resolvePrompt, shipHasTargets, type PromptKey } from '@shared/prompts'
import { Bus } from './bus/bus'
import { BrowserBridge } from './browser'
import { loginEnv, resolveClaude, runCommand, shTry } from './env'
import { GoalController, type GoalStart } from './goal'
import { HandoffShelf } from './handoffs'
import { buildBrief, writeSessionFiles, type HookEvent } from './hooks/inject'
import { readEnvFile } from './dotenv'
import { orchHome } from './paths'
import { PortWatcher } from './port-watcher'
import { suggestBranch } from './naming'
import { LIMIT, plainText, TRUST } from './termtext'
import { contextInfo, lastAssistantText, projectSlug } from './recents'
import { changedFiles, classify } from './ship'
import { getState, saveState, sessionDir } from './store'
import { baseName, commandFor, q, TARGET_KINDS } from './tiles'
import { dbInfo } from './db'
import { forgetVars, linkedProject, varsDiff } from './railway'
import { UsageTracker, sumTotals } from './usage'
import { fill } from './worktree/adapters'
import { primaryRoot } from './worktree/git'
import { WorktreeService } from './worktree/service'

type Emit = <K extends keyof EventMap>(ch: K, ...args: Parameters<EventMap[K]>) => void

interface Proc {
  pty?: pty.IPty
  chunks: string[]
  size: number
  pending: string
  seq: number
  flush?: NodeJS.Timeout
  token: string
  wtRoot: string
  /** the user has typed printable text since their last submit */
  draft: boolean
  lastStopAt: number
  wakes: number[]
  transcript?: string
  ctxAt: number
  cols: number
  rows: number
  /** a user-started handoff: the spawned successor needs no confirmation */
  autoApproveUntil?: number
  limitAt?: number
  /** first prompt for a new session, submitted once Claude reports SessionStart */
  pendingPrompt?: string
  /** the user asked for "fresh session with handoff"; the next Stop carries the handoff */
  handoffPending?: boolean
  handoffAt?: number
  /** what to do with the collected handoff: start a successor, keep it on the shelf, or keep it and close */
  handoffMode?: HandoffMode
}

export type HandoffMode = 'fresh' | 'save' | 'saveClose'

const BUFFER_CAP = 2_000_000
const NAMES = 'atlas birch cedar delta ember fern gale harbor iris juno kite lumen moss nova onyx pine quill reef sage tide umber vale willow yarrow zephyr'.split(' ')
const EDIT_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const LOCAL_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})(?:\/[^\s'"`<>)\]]*)?/

export function transcriptPath(cwd: string, id: string) {
  return join(homedir(), '.claude', 'projects', projectSlug(cwd), `${id}.jsonl`)
}

export class Hub {
  sessions = new Map<string, Session>()
  procs = new Map<string, Proc>()
  bus: Bus
  worktrees: WorktreeService
  watcher: PortWatcher
  baseUrl = ''
  serverPort = 0
  private pendingSpawns = new Map<string, (ok: boolean) => void>()
  private starting = new Map<string, Promise<void>>()
  onAttention: (s: Session, text: string) => void = () => {}
  browser = new BrowserBridge()
  shelf = new HandoffShelf(orchHome('handoffs'))
  goals: GoalController
  private usage = new UsageTracker()
  private usageTimer?: NodeJS.Timeout
  private adapters = new Map<string, { at: number; a: Adapter | null }>()
  private badgeAt = new Map<string, number>()

  constructor(
    private emit: Emit,
    adaptersDir: string,
  ) {
    const st = getState()
    for (const s of st.sessions) {
      // Nothing survives a restart; sessions come back via start() with --resume.
      this.sessions.set(s.id, { ...s, status: 'exited', ports: [], attention: undefined })
    }
    this.bus = new Bus({
      messages: st.messages,
      claims: st.claims,
      sessions: () => [...this.sessions.values()],
      onMessage: (m) => this.onBusMessage(m),
      onClaims: (c) => this.emit('claims:update', c),
      persist: () => saveState(),
    })
    this.worktrees = new WorktreeService({
      reservations: () => getState().reservations,
      reserve: (path, ports) => {
        if (ports) getState().reservations[path] = ports
        else delete getState().reservations[path]
        saveState()
      },
      listening: () => this.watcher.listening,
      adaptersDir,
    })
    this.watcher = new PortWatcher(
      () =>
        [...this.sessions.values()]
          .filter((s) => s.status !== 'exited' && s.kind !== 'design' && s.kind !== 'host')
          .map((s) => ({ id: s.id, pid: this.procs.get(s.id)?.pty?.pid, cwd: s.cwd })),
      (id, ports) => this.patch(id, { ports }),
      () => new Set([this.serverPort]),
    )
    this.goals = new GoalController(
      {
        prompt: (id, text) => this.typePrompt(id, text),
        qa: (worker, existing, text) => this.goalQa(worker, existing, text),
        attention: (id, text) => {
          const s = this.sessions.get(id)
          this.patch(id, { attention: text })
          if (s) this.onAttention(s, text)
          this.emit('ui:toast', `${s?.name ?? 'session'}: ${text}`, text.startsWith('Goal met') ? 'ok' : 'warn')
        },
        save: (id, goal) => this.patch(id, { goal: goal ? { ...goal, history: [...goal.history] } : undefined }),
      },
      (id) => this.sessions.get(id)?.name ?? id,
    )
    for (const s of this.sessions.values()) this.goals.load(s.id, s.goal)
    this.usageTimer = setInterval(() => this.emit('usage:update', this.usageSnapshot()), 10_000)
  }

  // ---------- state ----------

  list() {
    return [...this.sessions.values()]
  }

  private persist() {
    getState().sessions = this.list()
    saveState()
  }

  patch(id: string, p: Partial<Session>) {
    const s = this.sessions.get(id)
    if (!s) return
    Object.assign(s, p)
    this.emit('session:update', { ...s })
    this.persist()
  }

  async openProject(path: string): Promise<Project> {
    const st = getState()
    let p = st.projects.find((x) => x.path === path)
    if (!p) {
      p = {
        id: randomUUID().slice(0, 8),
        path,
        name: basename(path),
        color: PROJECT_COLORS[st.projects.length % PROJECT_COLORS.length],
        pinned: false,
        lastOpened: Date.now(),
      }
      st.projects.push(p)
    }
    p.lastOpened = Date.now()
    saveState()
    return p
  }

  private uniqueName(kind: Session['kind'], branch?: string, target?: TileTarget) {
    const taken = new Set(this.list().map((s) => s.name))
    if (target) {
      const base = baseName(target, branch)
      let n = base
      for (let i = 2; taken.has(n); i++) n = `${base}-${i}`
      return n
    }
    if (kind === 'dev') {
      const base = `dev:${branch ?? 'server'}`
      let n = base
      for (let i = 2; taken.has(n); i++) n = `${base}-${i}`
      return n
    }
    if (kind === 'shell') {
      let i = 1
      while (taken.has(`sh-${i}`)) i++
      return `sh-${i}`
    }
    const free = NAMES.find((n) => !taken.has(n))
    if (free) return free
    let i = 2
    while (taken.has(`claude-${i}`)) i++
    return `claude-${i}`
  }

  inUse(cwd: string) {
    return this.list().filter((s) => s.cwd === cwd && s.kind === 'claude' && s.status !== 'exited')
  }

  // ---------- spawn / lifecycle ----------

  async spawn(req: SpawnRequest): Promise<Session> {
    // Host tiles belong to no project; everything else opens (or creates) one.
    const project = req.projectPath ? await this.openProject(req.projectPath) : null
    const inRepo = req.kind !== 'host'
    const branch = inRepo ? (await shTry('git', ['rev-parse', '--abbrev-ref', 'HEAD'], req.cwd, 5000))?.trim() : undefined
    const repo = inRepo ? await primaryRoot(req.cwd) : undefined
    const id = req.resumeFrom ?? randomUUID()
    const s: Session = {
      id,
      kind: req.kind,
      name: req.name?.trim() || this.uniqueName(req.kind, branch, req.target),
      projectId: project?.id ?? '',
      cwd: req.cwd,
      branch,
      repo,
      role: req.role ?? 'plain',
      model: req.model || getState().settings.defaultModel || undefined,
      permissionMode: req.permissionMode ?? (req.role === 'reviewer' ? 'plan' : undefined),
      status: 'starting',
      createdAt: Date.now(),
      started: !!req.resumeFrom,
      ports: [],
      unread: 0,
      command: req.command,
      target: req.target,
    }
    this.sessions.set(id, s)
    this.persist()
    await this.start(id, req.prompt)
    return { ...this.sessions.get(id)! }
  }

  /** Starts queue per session: two overlapping starts (restore + a Restart click) would otherwise both spawn a process */
  async start(id: string, prompt?: string) {
    const run = (this.starting.get(id) ?? Promise.resolve()).catch(() => {}).then(() => this.startNow(id, prompt))
    this.starting.set(id, run)
    try {
      await run
    } finally {
      if (this.starting.get(id) === run) this.starting.delete(id)
    }
  }

  private async startNow(id: string, prompt?: string) {
    const s = this.sessions.get(id)
    if (!s) return
    const old = this.procs.get(id)
    if (old?.pty) {
      old.pty.kill()
      old.pty = undefined
    }
    // A design tile is a webview in the renderer; there is no process behind it.
    if (s.kind === 'design') return this.patch(id, { status: 'idle', exitCode: undefined })
    const env = { ...(await loginEnv()) }
    const wtRoot = (await shTry('git', ['rev-parse', '--show-toplevel'], s.cwd, 5000))?.trim() || s.cwd
    const ports = this.worktrees.portsFor(wtRoot)
    const proc: Proc = old ?? {
      chunks: [],
      size: 0,
      pending: '',
      seq: 0,
      token: '',
      wtRoot,
      draft: false,
      lastStopAt: 0,
      wakes: [],
      ctxAt: 0,
      cols: 120,
      rows: 34,
    }
    proc.token = randomBytes(16).toString('hex')
    proc.wtRoot = wtRoot
    this.procs.set(id, proc)

    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'Canopy',
      // Tells programs (Claude Code's auto theme among them) whether the terminal is light or dark
      COLORFGBG: lightTerminal() ? '0;15' : '15;0',
      ORCH_SESSION_ID: id,
      ORCH_SESSION_NAME: s.name,
      ORCH_URL: this.baseUrl,
    })
    if (ports) {
      env.PORT = String(ports.api)
      env.WEB_PORT = String(ports.web)
    }

    let file: string
    let args: string[]
    if (s.kind === 'claude') {
      const files = writeSessionFiles(sessionDir(id), this.baseUrl, id, proc.token)
      // Only resume when Claude actually wrote a transcript; --resume on an empty id fails.
      const resume = existsSync(transcriptPath(s.cwd, id))
      const roleKey = s.role === 'qa' ? 'qaBrief' : s.role === 'docs' ? 'docsBrief' : null
      const roleBrief = roleKey ? await this.prompt(id, roleKey) : undefined
      const brief = buildBrief(s, this.list().filter((o) => o.status !== 'exited'), ports, roleBrief)
      file = await resolveClaude()
      args = [
        ...(resume ? ['--resume', id] : ['--session-id', id]),
        '--mcp-config',
        files.mcp,
        '--settings',
        files.settings,
        '--append-system-prompt',
        brief,
      ]
      if (s.model) args.push('--model', s.model)
      if (s.permissionMode && s.permissionMode !== 'default') args.push('--permission-mode', s.permissionMode)
      // A positional prompt can land unsubmitted in the input box (multi-line ones do),
      // so hold it and paste it in once the session is up.
      if (prompt && !resume) proc.pendingPrompt = prompt
    } else if (TARGET_KINDS.has(s.kind) && s.target) {
      const dbUrl = s.target.kind === 'db' ? readEnvFile(join(s.cwd, s.target.envFile))[s.target.varName] : undefined
      const c = commandFor(s.target, { dbUrl })
      Object.assign(env, c.env)
      file = env.SHELL || '/bin/zsh'
      args = ['-lc', c.command]
    } else {
      file = env.SHELL || '/bin/zsh'
      args = s.kind === 'dev' && s.command ? ['-lc', s.command] : ['-l']
    }

    const p = pty.spawn(file, args, { name: 'xterm-256color', cols: proc.cols, rows: proc.rows, cwd: s.cwd, env })
    proc.pty = p
    this.patch(id, { status: s.kind === 'claude' ? 'starting' : 'idle', exitCode: undefined, attention: undefined })

    p.onData((d) => this.onData(id, proc, d))
    p.onExit(({ exitCode }) => {
      if (proc.pty !== p) return
      proc.pty = undefined
      this.flushNow(id, proc)
      this.emit('pty:exit', id, exitCode)
      this.patch(id, { status: exitCode === 0 || s.kind !== 'claude' ? 'exited' : 'error', exitCode, ports: [] })
      this.goals.onSessionGone(id)
    })
  }

  private onData(id: string, proc: Proc, d: string) {
    proc.chunks.push(d)
    proc.size += d.length
    while (proc.size > BUFFER_CAP && proc.chunks.length > 1) proc.size -= proc.chunks.shift()!.length
    proc.pending += d
    if (!proc.flush) proc.flush = setTimeout(() => this.flushNow(id, proc), 8)
    const s = this.sessions.get(id)
    const text = s?.kind === 'claude' || d.includes('://') ? plainText(d) : ''
    if (s?.kind === 'claude' && LIMIT.test(text) && Date.now() - (proc.limitAt ?? 0) > 120_000) {
      const line = text.split(/\r?\n/).find((l) => LIMIT.test(l))?.trim().slice(0, 160)
      if (line) {
        proc.limitAt = Date.now()
        this.patch(id, { attention: line })
        this.onAttention(s, line)
        this.emit('ui:toast', `${s.name}: ${line}`, 'warn')
      }
    }
    if (s?.kind === 'claude' && s.status === 'starting' && !s.attention && TRUST.test(text)) {
      const note = 'Asks whether to trust this folder'
      this.patch(id, { status: 'waiting', attention: note })
      this.onAttention(s, note)
    }
    if (s && d.includes('://')) {
      const m = LOCAL_URL.exec(text)
      if (m) {
        const url = m[0].replace('0.0.0.0', 'localhost').replace('127.0.0.1', 'localhost').replace(/[.,;:]+$/, '')
        if (url !== s.url) this.patch(id, { url })
      }
    }
  }

  private flushNow(id: string, proc: Proc) {
    if (proc.flush) clearTimeout(proc.flush)
    proc.flush = undefined
    if (!proc.pending) return
    proc.seq++
    this.emit('pty:data', id, proc.pending, proc.seq)
    proc.pending = ''
  }

  /** Scrollback for a (re)attaching terminal; events with seq <= the returned seq are already in it */
  buffer(id: string) {
    const proc = this.procs.get(id)
    if (!proc) return { data: '', seq: 0 }
    this.flushNow(id, proc)
    return { data: proc.chunks.join(''), seq: proc.seq }
  }

  ack(id: string) {
    const s = this.sessions.get(id)
    if (s?.attention && s.status !== 'waiting') this.patch(id, { attention: undefined })
  }

  write(id: string, data: string) {
    const proc = this.procs.get(id)
    if (!proc?.pty) return
    // Terminal replies (DA, focus, cursor reports) and control keys are not a draft;
    // typed text is, until it is submitted or cleared.
    if (/[\r\x03\x15]/.test(data)) proc.draft = false
    else if (!data.startsWith('\x1b') && /[^\x00-\x1f\x7f]/.test(data)) proc.draft = true
    proc.pty.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    const proc = this.procs.get(id)
    if (!proc || cols < 2 || rows < 2) return
    proc.cols = cols
    proc.rows = rows
    try {
      proc.pty?.resize(cols, rows)
    } catch {
      /* pty already gone */
    }
  }

  kill(id: string) {
    const proc = this.procs.get(id)
    proc?.pty?.kill()
  }

  async restart(id: string) {
    this.kill(id)
    await new Promise((r) => setTimeout(r, 150))
    await this.start(id)
  }

  remove(id: string) {
    this.goals.onSessionGone(id)
    this.kill(id)
    this.procs.delete(id)
    this.bus.release(id)
    this.sessions.delete(id)
    this.emit('session:removed', id)
    this.persist()
  }

  rename(id: string, name: string) {
    if (name.trim()) this.patch(id, { name: name.trim() })
  }

  killAll() {
    for (const p of this.procs.values()) p.pty?.kill()
  }

  /** Restore sessions that sit on a page; dev servers stay stopped */
  async restore(onPage: Set<string>) {
    for (const s of this.list()) {
      if (!onPage.has(s.id) || s.kind === 'dev') continue
      if (!existsSync(s.cwd)) continue
      await this.start(s.id).catch(() => this.patch(s.id, { status: 'error' }))
    }
  }

  async startDev(cwd: string, projectPath: string): Promise<Session> {
    const existing = this.list().find((s) => s.kind === 'dev' && s.cwd === cwd)
    const { cmd } = await this.worktrees.devCommand(cwd, projectPath)
    if (existing) {
      existing.command = cmd
      await this.restart(existing.id)
      return { ...existing }
    }
    return this.spawn({ kind: 'dev', projectPath, cwd, command: cmd })
  }

  // ---------- bus delivery ----------

  private onBusMessage(m: BusMessage) {
    this.emit('bus:message', m)
    for (const s of this.list()) {
      if (s.kind !== 'claude') continue
      const n = this.bus.unread(s.id).length
      if (n !== s.unread) this.patch(s.id, { unread: n })
      if (n && (m.wake || getState().settings.autoWake) && m.from !== s.id && this.bus.unread(s.id).some((u) => u.id === m.id))
        this.maybeWake(s.id)
    }
  }

  private rateOk(proc: Proc) {
    const now = Date.now()
    proc.wakes = proc.wakes.filter((t) => now - t < 5 * 60_000)
    if (proc.wakes.length >= 4) return false
    proc.wakes.push(now)
    return true
  }

  /** Nudge an idle session to read its inbox — unless the user is mid-draft in it */
  private maybeWake(id: string) {
    const s = this.sessions.get(id)
    const proc = this.procs.get(id)
    if (!s || !proc?.pty || s.status !== 'idle') return
    if (proc.draft) return
    if (!this.rateOk(proc)) return
    const p = proc.pty
    setTimeout(() => {
      if (proc.pty !== p) return
      p.write('\x1b[200~📬 New orchestrator message — see the inbox in your context and act on it.\x1b[201~')
      setTimeout(() => proc.pty === p && p.write('\r'), 120)
    }, 300)
  }

  // ---------- hooks ----------

  verify(id: string, token: string | null) {
    const proc = this.procs.get(id)
    return !!proc && !!token && proc.token === token
  }

  handleHook(id: string, event: HookEvent, payload: Record<string, any>): unknown {
    const s = this.sessions.get(id)
    const proc = this.procs.get(id)
    if (!s || !proc) return {}
    if (payload.transcript_path) proc.transcript = payload.transcript_path
    if (typeof payload.permission_mode === 'string' && payload.permission_mode !== s.permissionMode)
      this.patch(id, { permissionMode: payload.permission_mode as Session['permissionMode'] })
    const refreshCtx = (force = false) => {
      if (!proc.transcript || (!force && Date.now() - proc.ctxAt < 8000)) return
      proc.ctxAt = Date.now()
      const info = contextInfo(proc.transcript, s.model)
      if (!info) return
      const p: Partial<Session> = {}
      if (info.pct !== s.contextPct) p.contextPct = info.pct
      if (info.model && info.model !== s.model) p.model = info.model
      if (Object.keys(p).length) this.patch(id, p)
    }

    switch (event) {
      case 'SessionStart': {
        this.patch(id, { status: 'idle', started: true, attention: undefined })
        refreshCtx(true)
        const first = proc.pendingPrompt
        if (first) {
          proc.pendingPrompt = undefined
          setTimeout(() => this.typePrompt(id, first), 600)
        }
        return {}
      }
      case 'UserPromptSubmit': {
        this.patch(id, { status: 'working', attention: undefined, started: true })
        const msgs = this.bus.unread(id)
        if (!msgs.length) return {}
        const ctx = this.bus.formatInbox(id, msgs)
        this.bus.markRead(id, msgs.map((m) => m.id))
        this.patch(id, { unread: 0 })
        return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: ctx } }
      }
      case 'PreToolUse': {
        if (s.status !== 'working') this.patch(id, { status: 'working', attention: undefined })
        return this.claimGuard(s, proc, payload)
      }
      case 'PostToolUse': {
        if (s.status !== 'working') this.patch(id, { status: 'working', attention: undefined })
        const file = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path
        if (EDIT_TOOLS.test(String(payload.tool_name ?? '')) && file) {
          const rel = relative(proc.wtRoot, String(file))
          if (!rel.startsWith('..') && !s.touched?.includes(rel)) this.patch(id, { touched: [...(s.touched ?? []), rel].slice(-500) })
        }
        refreshCtx()
        return {}
      }
      case 'Notification': {
        const text = String(payload.message ?? 'Needs your attention')
        if (/waiting for your input/i.test(text)) return {}
        this.patch(id, { status: 'waiting', attention: text })
        this.onAttention(s, text)
        return {}
      }
      case 'Stop': {
        proc.lastStopAt = Date.now()
        refreshCtx(true)
        this.maybeBadge(s, proc.wtRoot)
        // A busy session can take a while to get to the handoff; give it half an hour (the spawn auto-approve window is separate).
        if (proc.handoffPending && Date.now() - (proc.handoffAt ?? 0) < 30 * 60_000) this.collectHandoff(s, proc)
        const nudge = payload.stop_hook_active ? null : this.goals.onStop(id)
        if (nudge) return { decision: 'block', reason: nudge }
        const msgs = this.bus.unread(id)
        const deliver = msgs.filter((m) => m.wake || getState().settings.autoWake)
        if (deliver.length && !payload.stop_hook_active && this.rateOk(proc)) {
          this.bus.markRead(id, deliver.map((m) => m.id))
          this.patch(id, { unread: this.bus.unread(id).length })
          return {
            decision: 'block',
            reason: `${this.bus.formatInbox(id, deliver)}\nThese messages arrived from other sessions while you were working. Handle them now (reply only if a reply is actually needed).`,
          }
        }
        this.patch(id, { status: 'idle', attention: 'Finished' })
        this.onAttention(s, 'Finished its turn')
        return {}
      }
      case 'PreCompact':
        this.bus.post('system', id, 'user', `${s.name} is compacting its context`)
        return {}
      default:
        return {}
    }
  }

  private claimGuard(s: Session, proc: Proc, payload: Record<string, any>) {
    if ((s.role === 'qa' || s.role === 'reviewer') && EDIT_TOOLS.test(String(payload.tool_name ?? ''))) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `[orchestrator] ${s.name} is a ${s.role} session and is read-only. Report what should change instead of editing.`,
        },
      }
    }
    const mode = getState().settings.claimMode
    if (mode === 'off') return {}
    const tool = String(payload.tool_name ?? '')
    if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool)) return {}
    const file = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path
    if (!file || !s.repo) return {}
    const rel = relative(proc.wtRoot, String(file))
    if (rel.startsWith('..')) return {}
    const owners = this.bus.owners(s.repo, rel, s.id)
    if (!owners.length) return {}
    const who = owners
      .map((c) => `${this.sessions.get(c.sessionId)?.name ?? c.sessionId} (${c.pattern}${c.reason ? `: ${c.reason}` : ''})`)
      .join(', ')
    const reason = `[orchestrator] ${rel} is claimed by ${who}. Coordinate with send_message before editing it.`
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: mode === 'deny' ? 'deny' : 'ask',
        permissionDecisionReason: reason,
      },
    }
  }

  // ---------- MCP tools ----------

  describe(s: Session) {
    return {
      id: s.id,
      name: s.name,
      kind: s.kind,
      role: s.role,
      status: s.status,
      task: s.task,
      branch: s.branch,
      cwd: s.cwd,
      ports: s.ports,
      reserved: this.worktrees.portsFor(this.procs.get(s.id)?.wtRoot ?? s.cwd),
      project: getState().projects.find((p) => p.id === s.projectId)?.name,
    }
  }

  confirmSpawn(requestId: string, ok: boolean) {
    this.pendingSpawns.get(requestId)?.(ok)
    this.pendingSpawns.delete(requestId)
  }

  // ---------- deploy and db tiles ----------

  /** Point a deploy or db tile somewhere else (an environment tab, another .env) and restart it */
  async retarget(id: string, target: TileTarget) {
    const s = this.sessions.get(id)
    if (!s || s.target?.kind !== target.kind) return
    forgetVars(id)
    this.patch(id, { target, name: s.target.kind === 'deploy' && s.name.startsWith('railway:') ? this.uniqueName(s.kind, s.branch, target) : s.name })
    await this.restart(id)
  }

  async dbInfo(id: string) {
    const s = this.sessions.get(id)
    if (s?.target?.kind !== 'db') throw new Error('Not a database tile')
    return dbInfo(s.cwd, s.target, await this.adapterFor(s))
  }

  /** The Railway target for this checkout: chosen before, from the adapter, or prefilled from the CLI's own link */
  async deploySuggest(cwd: string, projectPath: string) {
    const repo = (await primaryRoot(cwd).catch(() => null)) ?? cwd
    const saved = getState().deployTargets[repo]
    if (saved) return { repo, saved, linked: null }
    const project = getState().projects.find((p) => p.path === projectPath)
    const a = await this.worktrees.adapter(project?.path ?? projectPath).catch(() => null)
    if (a?.railway) return { repo, saved: { ...a.railway, environment: a.railway.environments?.[0] ?? 'production' }, linked: null }
    return { repo, saved: null, linked: linkedProject([cwd, repo, projectPath]) }
  }

  saveDeployTarget(repo: string, t: AppState['deployTargets'][string]) {
    getState().deployTargets[repo] = t
    saveState()
  }

  async deployVars(id: string, envFile?: string) {
    const s = this.sessions.get(id)
    if (s?.target?.kind !== 'deploy') throw new Error('Not a deploy tile')
    return varsDiff(id, s.target, s.cwd, envFile)
  }

  /** `railway ssh` into the deploy tile's service, in a tile of its own */
  deploySsh(id: string) {
    const s = this.sessions.get(id)
    if (s?.target?.kind !== 'deploy') throw new Error('Not a deploy tile')
    const t = s.target
    const project = getState().projects.find((p) => p.id === s.projectId)
    return this.spawn({
      kind: 'dev',
      projectPath: project?.path ?? s.cwd,
      cwd: s.cwd,
      name: `ssh:${t.service}@${t.environment}`,
      command: `railway ssh -p ${q(t.project)} -e ${q(t.environment)} -s ${q(t.service)}`,
    })
  }

  // ---------- prompts ----------

  /** A prompt for this session: settings override, then the repo's adapter, then the default */
  async prompt(id: string, key: PromptKey, vars: Record<string, string | number | undefined> = {}) {
    const s = this.sessions.get(id)
    const a = s ? await this.adapterFor(s) : null
    return resolvePrompt(key, { settings: getState().settings.prompts, adapter: a?.prompts }, vars)
  }

  async shipTargets(id: string) {
    const s = this.sessions.get(id)
    const a = s ? await this.adapterFor(s) : null
    return shipHasTargets({ settings: getState().settings.prompts, adapter: a?.prompts })
  }

  /** Ask the session for a handoff; the next Stop collects it from the transcript */
  async requestHandoff(id: string, mode: HandoffMode = 'fresh') {
    const text = await this.prompt(id, 'handoff')
    this.allowHandoff(id)
    const proc = this.procs.get(id)
    if (proc) proc.handoffMode = mode
    this.typePrompt(id, text)
  }

  /** The user asked for this handoff from the tile menu, so its successor needs no confirm */
  allowHandoff(id: string) {
    const proc = this.procs.get(id)
    if (!proc) return
    proc.autoApproveUntil = Date.now() + 5 * 60_000
    proc.handoffPending = true
    proc.handoffAt = Date.now()
  }

  /**
   * Don't depend on the model calling the handoff tool: take what it printed.
   * The transcript can lag the Stop hook, so wait for a reply newer than the request.
   */
  private async collectHandoff(s: Session, proc: Proc) {
    proc.handoffPending = false
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 600))
      const last = proc.transcript ? lastAssistantText(proc.transcript) : { text: '', ts: 0 }
      if (last.ts > (proc.handoffAt ?? 0) && last.text.length > 40) {
        proc.autoApproveUntil = undefined
        const mode = proc.handoffMode ?? 'fresh'
        proc.handoffMode = undefined
        await this.finishHandoff(s, last.text, mode).catch((e) => this.emit('ui:toast', `Handoff failed: ${(e as Error).message}`, 'error'))
        return
      }
    }
    // Nothing usable yet (e.g. a user Stop hook made it keep going); try again next Stop.
    proc.handoffPending = true
  }

  /** Every collected handoff lands on the shelf; fresh ones are marked used right away */
  private async finishHandoff(s: Session, text: string, mode: HandoffMode) {
    const project = getState().projects.find((p) => p.id === s.projectId)
    const saved = this.shelf.save(
      { project: project?.path ?? s.repo ?? s.cwd, cwd: s.cwd, branch: s.branch, session: s.name, transcriptId: s.id, used: mode === 'fresh' ? Date.now() : undefined },
      text,
    )
    this.emit('handoffs:changed')
    if (mode === 'fresh') return void (await this.handoffSpawn(s, text))
    this.emit('ui:toast', `Saved handoff “${saved.title}”${mode === 'saveClose' ? ` and closed ${s.name}` : ''}`, 'ok')
    if (mode === 'saveClose') this.remove(s.id)
  }

  listHandoffs(projectPath?: string): HandoffMeta[] {
    return this.shelf.list(projectPath).map((h) => ({ ...h, resumable: !!h.transcriptId && existsSync(transcriptPath(h.cwd, h.transcriptId)) }))
  }

  /** Start a session from a saved handoff, or resume the conversation it came from */
  async pickUp(file: string, original = false): Promise<Session> {
    const { meta, body } = this.shelf.read(file)
    let s: Session
    if (original && meta.transcriptId && existsSync(transcriptPath(meta.cwd, meta.transcriptId))) {
      const existing = this.sessions.get(meta.transcriptId)
      if (existing) {
        if (existing.status === 'exited' || existing.status === 'error') await this.start(existing.id)
        s = { ...existing }
      } else {
        const taken = this.list().some((o) => o.name === meta.session)
        s = await this.spawn({ kind: 'claude', projectPath: meta.project, cwd: meta.cwd, resumeFrom: meta.transcriptId, name: taken ? undefined : meta.session })
      }
    } else {
      const here = existsSync(meta.cwd)
      const cwd = here ? meta.cwd : ((await primaryRoot(meta.project).catch(() => null)) ?? meta.project)
      const restore = !here && meta.branch ? `Its worktree (${meta.cwd}) no longer exists. Restore branch ${meta.branch} first (a new worktree or a checkout), then continue. ` : ''
      s = await this.spawn({
        kind: 'claude',
        projectPath: meta.project,
        cwd,
        prompt: `You are picking up saved work${meta.session ? ` from session ${meta.session}` : ''}. ${restore}The handoff:\n\n${body}\n\nRead any files it points to, then carry on from its next steps.`,
      })
    }
    this.shelf.markUsed(file)
    this.emit('handoffs:changed')
    return s
  }

  /** Start the successor of a handed-off session in its tile, seeded with the handoff */
  async handoffSpawn(from: Session, summary: string) {
    const project = getState().projects.find((p) => p.id === from.projectId)
    const next = await this.spawn({
      kind: 'claude',
      projectPath: project?.path ?? from.cwd,
      cwd: from.cwd,
      role: from.role,
      model: from.model,
      name: from.name,
      prompt: `You are picking up from an earlier session (${from.name}) that ran out of room. Their handoff:\n\n${summary}\n\nRead any files it points to, then carry on from its next steps.`,
    })
    this.emit('ui:replaceTile', from.id, next.id)
    return next
  }

  async requestSpawn(from: Session, req: SpawnRequest & { branch?: string; worktree?: string }, opts: { handoff?: boolean } = {}) {
    const fromProc = this.procs.get(from.id)
    const preApproved = !!opts.handoff && (fromProc?.autoApproveUntil ?? 0) > Date.now()
    if (preApproved && fromProc) {
      fromProc.autoApproveUntil = undefined
      fromProc.handoffPending = false
    }
    const requestId = randomUUID()
    const ok =
      preApproved ||
      (await new Promise<boolean>((resolve) => {
        this.pendingSpawns.set(requestId, resolve)
        this.emit('ui:confirmSpawn', requestId, req, from.name)
        setTimeout(() => this.pendingSpawns.has(requestId) && this.confirmSpawn(requestId, false), 180_000)
      }))
    if (!ok) throw new Error('The user declined the new session')
    let cwd = req.cwd
    if (req.worktree === 'new') {
      const branch =
        req.branch || (await suggestBranch(req.projectPath, req.prompt || req.name || '', (await this.worktrees.adapter(req.projectPath))?.branchPrefix)).branch
      const wt = await this.worktrees.create({ projectPath: req.projectPath, branch })
      cwd = wt.path
    } else if (req.worktree && req.worktree !== 'same') cwd = req.worktree
    const s = await this.spawn({ ...req, cwd, name: req.name ?? (preApproved ? from.name : undefined) })
    if (preApproved) this.emit('ui:replaceTile', from.id, s.id)
    else this.emit('ui:addTile', s.id, from.id)
    return s
  }

  // ---------- typing into sessions ----------

  /** Submit a prompt into a Claude session's input, as if typed */
  typePrompt(id: string, text: string) {
    const proc = this.procs.get(id)
    const p = proc?.pty
    if (!p) return
    p.write(`\x1b[200~${text}\x1b[201~`)
    setTimeout(() => proc.pty === p && p.write('\r'), 150)
  }

  // ---------- goals ----------

  startGoal(id: string, opts: GoalStart) {
    return this.goals.start(id, opts)
  }

  private async goalQa(workerId: string, existing: string | undefined, text: string) {
    const live = existing ? this.sessions.get(existing) : undefined
    if (live && live.status !== 'exited' && live.status !== 'error') {
      this.typePrompt(live.id, text)
      return live.id
    }
    const w = this.sessions.get(workerId)!
    const project = getState().projects.find((p) => p.id === w.projectId)
    const qa = await this.spawn({
      kind: 'claude',
      projectPath: project?.path ?? w.cwd,
      cwd: w.cwd,
      role: 'qa',
      // Read-only is enforced by the PreToolUse hook (readOnlyGuard), so QA can run
      // its checks unattended instead of stopping on every shell command.
      permissionMode: 'auto',
      model: w.model,
      name: `${w.name}-qa`,
      prompt: text,
    })
    this.emit('ui:addTile', qa.id, workerId)
    return qa.id
  }

  // ---------- adapters, actions, badge ----------

  async adapterFor(s: Session): Promise<Adapter | null> {
    const key = s.repo ?? s.cwd
    const hit = this.adapters.get(key)
    if (hit && Date.now() - hit.at < 60_000) return hit.a
    const project = getState().projects.find((p) => p.id === s.projectId)
    const a = await this.worktrees.adapter(project?.path ?? s.cwd).catch(() => null)
    this.adapters.set(key, { at: Date.now(), a })
    return a
  }

  async actionsFor(id: string): Promise<AdapterAction[]> {
    const s = this.sessions.get(id)
    if (!s) return []
    const a = await this.adapterFor(s)
    const primary = a?.primary ?? s.repo ?? s.cwd
    return (a?.actions ?? []).map((x) => ({ ...x, command: fill(x.command, { primary, path: s.cwd }) }))
  }

  private maybeBadge(s: Session, wtRoot: string) {
    const last = this.badgeAt.get(wtRoot) ?? 0
    if (Date.now() - last < 30_000) return
    this.badgeAt.set(wtRoot, Date.now())
    this.runBadge(s.id).catch(() => {})
  }

  async runBadge(id: string) {
    const s = this.sessions.get(id)
    if (!s) return
    const a = await this.adapterFor(s)
    if (!a?.badge) return
    const wtRoot = this.procs.get(id)?.wtRoot ?? s.cwd
    const same = () => this.list().filter((o) => (this.procs.get(o.id)?.wtRoot ?? o.cwd) === wtRoot)
    for (const o of same()) this.patch(o.id, { badge: { label: a.badge.label, ok: o.badge?.ok ?? true, out: o.badge?.out ?? '', at: o.badge?.at ?? 0, running: true } })
    const cmd = fill(a.badge.command, { primary: a.primary ?? s.repo ?? s.cwd, path: wtRoot })
    const { code, out } = await runCommand(wtRoot, cmd, 5 * 60_000)
    const badge = { label: a.badge.label, ok: code === 0, out: out.slice(-6000), at: Date.now() }
    for (const o of same()) this.patch(o.id, { badge })
  }

  // ---------- ports ----------

  portsSnapshot(): PortsSnapshot {
    const live = new Set(this.watcher.listeners.map((l) => l.port))
    return {
      listeners: [...this.watcher.listeners].sort((a, b) => a.port - b.port),
      reserved: Object.entries(getState().reservations).map(([path, r]) => ({ path, web: r.web, api: r.api, live: live.has(r.web) || live.has(r.api) })),
    }
  }

  killPid(pid: number) {
    if (!pid || pid === process.pid) return false
    try {
      process.kill(pid, 'SIGTERM')
    } catch {
      return false
    }
    setTimeout(() => {
      try {
        process.kill(pid, 0)
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }, 3000)
    setTimeout(() => this.watcher.scan().catch(() => {}), 600)
    return true
  }

  // ---------- usage ----------

  usageSnapshot(): UsageSnapshot {
    const sessions: UsageSnapshot['sessions'] = {}
    for (const s of this.list()) {
      if (s.kind !== 'claude') continue
      const file = this.procs.get(s.id)?.transcript ?? transcriptPath(s.cwd, s.id)
      const st = this.usage.read(file)
      if (st) sessions[s.id] = { today: { ...st.today }, all: { ...st.all }, model: st.model }
    }
    return { today: sumTotals(Object.values(sessions).map((x) => x.today)), sessions, at: Date.now() }
  }

  // ---------- ship ----------

  async shipPlan(id: string) {
    const s = this.sessions.get(id)
    if (!s) throw new Error('Unknown session')
    const { files, branch, upstream } = await changedFiles(s.cwd)
    const others = this.list().filter((o) => o.id !== id && o.cwd === s.cwd && o.kind === 'claude')
    const names = Object.fromEntries(this.list().map((o) => [o.id, o.name]))
    return { files: classify(files, s, others, getState().claims), branch, upstream, names }
  }

  dispose() {
    if (this.usageTimer) clearInterval(this.usageTimer)
  }

  reserved(cwd: string): PortPair | null {
    return this.worktrees.portsFor(cwd)
  }

  sessionRole(r?: string): Role {
    return (['plain', 'lead', 'worker', 'reviewer', 'qa', 'docs'] as const).includes(r as Role) ? (r as Role) : 'worker'
  }
}

/** Matches the renderer's terminal palettes */
function lightTerminal() {
  return !nativeTheme.shouldUseDarkColors
}
