import type { PromptOverrides } from './prompts'

export type SessionKind = 'claude' | 'shell' | 'dev' | 'deploy' | 'db' | 'host' | 'design'
export type SessionStatus = 'starting' | 'idle' | 'working' | 'waiting' | 'exited' | 'error'
export type Role = 'plain' | 'lead' | 'worker' | 'reviewer' | 'qa' | 'docs'
export type PermissionMode = 'default' | 'auto' | 'acceptEdits' | 'plan' | 'bypassPermissions'

export interface Project {
  id: string
  path: string
  name: string
  color: string
  pinned: boolean
  lastOpened: number
}

export interface RecentProject {
  path: string
  name: string
  lastUsed: number
  prompts: number
  exists: boolean
  isGit: boolean
  branch?: string
  worktrees?: number
}

export interface PortPair {
  web: number
  api: number
}

export interface Worktree {
  path: string
  branch: string
  head: string
  isPrimary: boolean
  ports: PortPair | null
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  dirty: number
  upstream?: string
  pr?: { number: number; url: string; state: string } | null
}

export interface Session {
  id: string
  kind: SessionKind
  name: string
  projectId: string
  cwd: string
  branch?: string
  role: Role
  model?: string
  permissionMode?: PermissionMode
  status: SessionStatus
  task?: string
  progress?: number
  createdAt: number
  /** claude has run at least once with this id, so restarts use --resume */
  started: boolean
  ports: number[]
  unread: number
  contextPct?: number
  attention?: string
  exitCode?: number
  command?: string
  /** last localhost URL the process printed, used to pick the preview port */
  url?: string
  /** primary checkout of the repo this session works in */
  repo?: string
  /** repo-relative files this session edited (Edit/Write/MultiEdit) */
  touched?: string[]
  /** last effort level set from the app (Claude Code does not report it) */
  effort?: string
  badge?: BadgeResult
  goal?: GoalState
  /** what a deploy, db, host or design tile points at */
  target?: TileTarget
}

export type TileTarget =
  | { kind: 'deploy'; project: string; projectName?: string; environment: string; service: string; environments?: string[] }
  | { kind: 'db'; envFile: string; varName: string }
  | { kind: 'host'; host: string; claude?: boolean }
  | { kind: 'design'; url: string; pairedWith?: string }

export interface HostEntry {
  name: string
  /** what follows `ssh`, e.g. `admin@mac-studio.local -i ~/.ssh/mac_studio`; empty means the name itself */
  target?: string
  source: 'ssh-config' | 'app'
}

export interface SkillInfo {
  name: string
  description: string
  source: 'user' | 'plugin' | 'project'
}

export interface DeployTarget {
  project: string
  projectName?: string
  service: string
  environment: string
  environments?: string[]
}

export interface RailwayProject {
  id: string
  name: string
  environments: string[]
  services: string[]
}

export interface VarRow {
  key: string
  status: 'same' | 'differs' | 'local' | 'remote' | 'sealed'
}

export interface DbInfo {
  envFile: string
  varName: string
  conn: { host: string; port: string; database: string; user?: string } | null
  envFiles: string[]
  scripts: { name: string; command: string; danger: boolean }[]
  drift?: string
}

export interface HandoffMeta {
  file: string
  title: string
  project: string
  cwd: string
  branch?: string
  session?: string
  transcriptId?: string
  created: number
  used?: number
  /** the original conversation's transcript still exists */
  resumable?: boolean
}

export interface BadgeResult {
  label: string
  ok: boolean
  out: string
  at: number
  running?: boolean
}

export interface GoalRound {
  round: number
  summary: string
  remaining?: string
  verdict?: { clean: boolean; findings: string }
}

export interface GoalState {
  goal: string
  stop: string
  maxRounds: number
  round: number
  qa: boolean
  qaSessionId?: string
  history: GoalRound[]
  status: 'running' | 'verifying' | 'met' | 'stopped'
  nudged?: number
}

export interface ListenerInfo {
  pid: number
  port: number
  command?: string
  cwd?: string
  sessionId?: string
}

export interface PortsSnapshot {
  listeners: ListenerInfo[]
  reserved: { path: string; web: number; api: number; live: boolean }[]
}

export interface TokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface UsageSnapshot {
  today: TokenTotals
  sessions: Record<string, { today: TokenTotals; all: TokenTotals; model?: string }>
  at: number
}

export interface PrCheck {
  name: string
  state: 'pass' | 'fail' | 'pending' | 'skipped'
}

export interface PrInfo {
  number: number
  title: string
  url: string
  state: string
  isDraft: boolean
  body: string
  reviewDecision?: string
  checks: PrCheck[]
  comments: { author: string; body: string; at: string }[]
  reviews: { author: string; state: string; body: string }[]
  head: string
  base: string
}

export interface AdapterAction {
  id: string
  label: string
  command: string
  show: 'tile' | 'quiet'
}

export interface ShipFile {
  path: string
  owner: 'mine' | string
  why: 'touched' | 'claimed' | 'default'
}

export interface ShotSetPrefs {
  routes: string[]
  width: number
  scheme: 'light' | 'dark'
}

export interface PreviewState {
  open: boolean
  url: string
  width: 'fill' | number
  split: number
}

export interface Tile {
  id: string
  sessionId: string
  preview?: PreviewState
}

export interface Page {
  id: string
  name: string
  tiles: Tile[]
  focusedTileId?: string | null
}

export type BusKind = 'message' | 'broadcast' | 'claim' | 'release' | 'handoff' | 'system' | 'status'

export interface BusMessage {
  id: string
  kind: BusKind
  from: string
  to: string
  body: string
  ts: number
  readBy: string[]
  wake?: boolean
}

export interface Claim {
  id: string
  sessionId: string
  /** primary checkout of the repo; claims span every worktree of it */
  repo: string
  /** repo-relative path or glob */
  pattern: string
  reason: string
  ts: number
}

export interface Conflict {
  file: string
  worktrees: string[]
}

export interface Adapter {
  name?: string
  match?: string
  primary?: string
  worktree?: {
    create?: string
    remove?: string
    run?: string
    status?: string
    preflight?: string
    root?: string
  }
  ports?: Partial<PortPair>
  actions?: AdapterAction[]
  badge?: { label: string; command: string; on: 'stop' | 'interval' }
  devCommand?: string
  previewPath?: string
  envPortKeys?: Partial<Record<'web' | 'api', string[]>>
  symlinks?: string[]
  prompts?: PromptOverrides
  db?: { envFile?: string; varName?: string; drift?: string }
  railway?: { project: string; service: string; environments?: string[] }
}

export interface Settings {
  claimMode: 'warn' | 'deny' | 'off'
  autoWake: boolean
  defaultPermissionMode: PermissionMode
  defaultModel: string
  reduceMotion: boolean
  notifications: boolean
  prompts?: PromptOverrides
  hosts?: HostEntry[]
}

export interface AppState {
  projects: Project[]
  pages: Page[]
  activePageId: string | null
  sessions: Session[]
  messages: BusMessage[]
  claims: Claim[]
  reservations: Record<string, PortPair>
  settings: Settings
  shotSets: Record<string, ShotSetPrefs>
  /** Railway target per primary checkout, chosen once in the deploy setup sheet */
  deployTargets: Record<string, DeployTarget>
}

export interface SpawnRequest {
  kind: SessionKind
  projectPath: string
  cwd: string
  name?: string
  role?: Role
  model?: string
  permissionMode?: PermissionMode
  prompt?: string
  command?: string
  pageId?: string
  resumeFrom?: string
  target?: TileTarget
}

export interface NewWorktreeRequest {
  projectPath: string
  branch: string
  base?: string
}

export interface ScreenshotResult {
  path: string
}

export interface TranscriptSummary {
  id: string
  cwd: string
  firstPrompt: string
  mtime: number
}

export const DEFAULT_SETTINGS: Settings = {
  claimMode: 'warn',
  autoWake: true,
  defaultPermissionMode: 'default',
  defaultModel: '',
  reduceMotion: false,
  notifications: true,
}

export const PROJECT_COLORS = [
  '#a78bfa',
  '#60a5fa',
  '#34d399',
  '#f472b6',
  '#fbbf24',
  '#22d3ee',
  '#fb923c',
  '#c084fc',
  '#4ade80',
  '#f87171',
]
