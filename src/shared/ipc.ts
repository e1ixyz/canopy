import type { PromptKey } from './prompts'
import type {
  Adapter,
  BranchSuggestion,
  AdapterAction,
  HandoffMeta,
  DbInfo,
  DeployTarget,
  RailwayProject,
  TileTarget,
  VarRow,
  HostEntry,
  SkillInfo,
  PortsSnapshot,
  PrInfo,
  ShipFile,
  ShotSetPrefs,
  UsageSnapshot,
  AppState,
  BusMessage,
  Claim,
  Conflict,
  GitStatus,
  NewWorktreeRequest,
  Page,
  Project,
  RecentProject,
  Session,
  Settings,
  SpawnRequest,
  TranscriptSummary,
  Worktree,
} from './types'

/** renderer -> main request/response channels */
export interface InvokeMap {
  'state:get': () => AppState
  'recents:list': () => RecentProject[]
  'project:open': (path: string) => Project
  'project:pin': (id: string, pinned: boolean) => void
  'project:forget': (id: string) => void
  'dialog:openFolder': () => string | null
  'adapter:get': (projectPath: string) => Adapter | null
  'worktree:list': (projectPath: string) => Worktree[]
  'worktree:create': (req: NewWorktreeRequest) => Worktree
  'worktree:suggestName': (projectPath: string, task: string) => BranchSuggestion
  'worktree:remove': (path: string, force: boolean) => { ok: boolean; reason?: string }
  'git:status': (cwd: string) => GitStatus | null
  'git:branches': (projectPath: string) => string[]
  'conflicts:get': (projectPath: string) => Conflict[]
  'session:spawn': (req: SpawnRequest) => Session
  'session:kill': (id: string) => void
  'session:restart': (id: string) => void
  'session:remove': (id: string) => void
  'session:rename': (id: string, name: string) => void
  'session:inUse': (cwd: string) => Session[]
  'pty:buffer': (id: string) => { data: string; seq: number }
  'session:ack': (id: string) => void
  'preview:shot': (webContentsId: number, label: string) => string
  'preview:emulate': (webContentsId: number, scheme: 'dark' | 'light' | null) => void
  'shell:run': (cwd: string, projectPath: string, command: string, name?: string) => Session
  'pages:save': (pages: Page[], activePageId: string | null) => void
  'bus:send': (msg: { to: string; body: string; wake?: boolean; from?: string; projectId?: string }) => BusMessage
  'bus:clear': () => void
  'claims:release': (id: string) => void
  'settings:set': (patch: Partial<Settings>) => Settings
  'shot:save': (dataUrl: string, label: string) => string
  'transcripts:list': (projectPath: string) => TranscriptSummary[]
  'shell:openExternal': (url: string) => void
  'shell:reveal': (path: string) => void
  'dev:start': (cwd: string, projectPath: string) => Session
  'handoff:toNew': (id: string) => void
  'spawn:confirm': (requestId: string, ok: boolean) => void
  'ports:list': () => PortsSnapshot
  'ports:kill': (pid: number) => boolean
  'usage:get': () => UsageSnapshot
  'pr:get': (cwd: string, force: boolean) => PrInfo | null
  'adapter:actions': (sessionId: string) => AdapterAction[]
  'badge:run': (sessionId: string) => void
  'session:setMeta': (id: string, meta: { effort?: string }) => void
  'goal:start': (id: string, opts: { goal: string; stop: string; maxRounds: number; qa: boolean }) => void
  'goal:stop': (id: string) => void
  'ship:plan': (id: string) => { files: ShipFile[]; branch?: string; upstream?: string; names: Record<string, string> }
  'preview:register': (sessionId: string, cwd: string, wcId: number) => void
  'preview:unregister': (sessionId: string, wcId: number) => void
  'shots:capture': (opts: { wcId: number; base: string; routes: string[]; width: number; scheme: 'light' | 'dark'; folder: string }) => { folder: string; files: string[] }
  'shots:remember': (projectPath: string, prefs: ShotSetPrefs) => void
  'handoff:allow': (id: string) => void
  'prompts:get': (sessionId: string, key: PromptKey, vars?: Record<string, string | number | undefined>) => string
  'prompts:shipTargets': (sessionId: string) => boolean
  'adapters:openFolder': () => void
  'handoff:save': (id: string, close: boolean) => void
  'handoffs:list': (projectPath?: string) => HandoffMeta[]
  'handoffs:counts': () => Record<string, number>
  'handoffs:rename': (file: string, title: string) => void
  'handoffs:remove': (file: string) => void
  'handoffs:open': (file: string) => void
  'handoffs:import': (projectPath: string) => HandoffMeta | null
  'handoffs:pickUp': (file: string, original: boolean) => Session
  'hosts:list': () => HostEntry[]
  'skills:list': (cwd?: string) => SkillInfo[]
  'session:retarget': (id: string, target: TileTarget) => void
  'db:info': (sessionId: string) => DbInfo
  'db:envFiles': (cwd: string, varName?: string) => string[]
  'deploy:projects': () => RailwayProject[]
  'deploy:suggest': (cwd: string, projectPath: string) => { repo: string; saved: DeployTarget | null; linked: { project: string; environment?: string; service?: string } | null }
  'deploy:save': (repo: string, target: DeployTarget) => void
  'deploy:vars': (sessionId: string, envFile?: string) => VarRow[]
  'deploy:reveal': (sessionId: string, key: string) => { local?: string; remote?: string } | null
  'deploy:ssh': (sessionId: string) => Session
  'preview:capture': (webContentsId: number) => string
}

/** renderer -> main fire-and-forget */
export interface SendMap {
  'pty:write': (id: string, data: string) => void
  'pty:resize': (id: string, cols: number, rows: number) => void
}

/** main -> renderer events */
export interface EventMap {
  'pty:data': (id: string, data: string, seq: number) => void
  'pty:exit': (id: string, code: number) => void
  'session:update': (s: Session) => void
  'session:removed': (id: string) => void
  'handoffs:changed': () => void
  'bus:message': (m: BusMessage) => void
  'bus:cleared': () => void
  'claims:update': (c: Claim[]) => void
  'ui:openPreview': (sessionId: string, url: string) => void
  'ui:confirmSpawn': (requestId: string, req: SpawnRequest, by: string) => void
  'ui:focusSession': (sessionId: string) => void
  'ui:addTile': (sessionId: string, nearSessionId?: string) => void
  'ui:replaceTile': (oldSessionId: string, newSessionId: string) => void
  'ui:toast': (text: string, tone: 'info' | 'ok' | 'warn' | 'error') => void
  'ui:previewWidth': (sessionId: string, width: number | 'fill') => void
  'usage:update': (u: UsageSnapshot) => void
  'shots:progress': (i: number, n: number, file: string) => void
}

export interface OrchApi {
  invoke<K extends keyof InvokeMap>(
    channel: K,
    ...args: Parameters<InvokeMap[K]>
  ): Promise<Awaited<ReturnType<InvokeMap[K]>>>
  send<K extends keyof SendMap>(channel: K, ...args: Parameters<SendMap[K]>): void
  on<K extends keyof EventMap>(channel: K, cb: EventMap[K]): () => void
  pathForFile(file: File): string
  homedir: string
  platform: string
}
