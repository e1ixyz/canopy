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
  /** profile new sessions in this project start with, over the active one */
  profileId?: string
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
  /** Claude profile (config dir) the session runs under; unset means the default */
  profileId?: string
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
  /** profile the original session ran under */
  profileId?: string
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
  /** USD at API list prices for the model that served each message */
  cost: number
}

/** A session closed today: its transcripts keep counting toward today's total until the day ends */
export interface ClosedUsage {
  id: string
  name: string
  projectId: string
  profileId?: string
  files: string[]
  at: number
}

export interface UsageSnapshot {
  today: TokenTotals
  /** today's totals per profile id */
  byProfile?: Record<string, TokenTotals>
  sessions: Record<string, { today: TokenTotals; all: TokenTotals; model?: string }>
  /** sessions closed today, still counted in today */
  closed?: { id: string; name: string; projectId: string; today: TokenTotals; model?: string }[]
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
  /** For `to: 'project'` from the GUI, which has no project of its own */
  projectId?: string
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
  /** Prefix for worktree branches the app names itself (default: the repo's usual prefix, else orch/) */
  branchPrefix?: string
}

export interface BranchSuggestion {
  branch: string
  /** where the slug came from: the model, or the prompt's first words */
  source: 'claude' | 'prompt'
}

export type Appearance = 'system' | 'light' | 'dark'

export interface UpdateCommit {
  sha: string
  subject: string
}

/** Self-update for install-app builds: GitHub's origin/main compared with the commit the app was built from */
export interface UpdateState {
  /** false in dev and in release builds, which have no checkout to update from */
  enabled: boolean
  phase: 'idle' | 'available' | 'building' | 'ready' | 'error'
  /** short sha the running app was built from */
  built: string
  latest?: string
  behind?: number
  commits?: UpdateCommit[]
  /** what a build is doing right now */
  step?: string
  error?: string
  checkedAt?: number
}

export interface Settings {
  /** Light or dark; 'system' follows macOS */
  appearance?: Appearance
  /** New worktrees without a branch name are named from the first prompt */
  nameWorktrees?: boolean
  claimMode: 'warn' | 'deny' | 'off'
  autoWake: boolean
  defaultPermissionMode: PermissionMode
  defaultModel: string
  reduceMotion: boolean
  notifications: boolean
  prompts?: PromptOverrides
  hosts?: HostEntry[]
  /** Claude accounts, each its own config dir; the default (~/.claude) is always first */
  profiles?: Profile[]
  /** profile new sessions start with */
  activeProfileId?: string
}

/**
 * A Claude account. Sessions on a profile run with CLAUDE_CONFIG_DIR set to its folder, so
 * each has its own login, settings, history and transcripts. The default profile has no
 * configDir and leaves CLAUDE_CONFIG_DIR unset.
 */
export interface Profile {
  id: string
  name: string
  /** a key of PROFILE_COLORS */
  color: string
  configDir?: string
}

export const DEFAULT_PROFILE_ID = 'default'

export interface NewProfile {
  name: string
  color: string
  configDir: string
  /** copy settings.json and CLAUDE.md from ~/.claude */
  copySettings: boolean
  /** symlink ~/.claude/skills so both profiles share skills */
  linkSkills: boolean
}

/** Profile colors, each with a darker shade for light mode */
export const PROFILE_COLORS: Record<string, { dark: string; light: string }> = {
  orange: { dark: '#f2a15a', light: '#c4650f' },
  violet: { dark: '#b892ff', light: '#7c4ddb' },
  teal: { dark: '#4cc3b4', light: '#0f7d72' },
  pink: { dark: '#ff8fb8', light: '#c2306a' },
  yellow: { dark: '#f0c05a', light: '#8a6100' },
  green: { dark: '#6fcf86', light: '#1e7d4f' },
}

/** The profile list with the default always present and first */
export function profilesOf(settings: Pick<Settings, 'profiles'>): Profile[] {
  const list = settings.profiles ?? []
  const def = list.find((p) => p.id === DEFAULT_PROFILE_ID) ?? { id: DEFAULT_PROFILE_ID, name: 'Default', color: 'orange' }
  return [def, ...list.filter((p) => p.id !== DEFAULT_PROFILE_ID)]
}

export function profileColor(color: string | undefined, mode: 'light' | 'dark') {
  return (PROFILE_COLORS[color ?? ''] ?? PROFILE_COLORS.orange)[mode]
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
  /** transcripts a session wrote before its current one (a /clear starts a new file), kept across restarts */
  usageFiles?: Record<string, string[]>
  /** sessions closed today, so the meter doesn't drop their tokens */
  closedUsage?: ClosedUsage[]
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
  profileId?: string
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
  /** profile whose config dir holds the transcript */
  profileId?: string
}

export const DEFAULT_SETTINGS: Settings = {
  claimMode: 'warn',
  autoWake: true,
  defaultPermissionMode: 'default',
  defaultModel: '',
  reduceMotion: false,
  notifications: true,
  appearance: 'system',
  nameWorktrees: true,
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
