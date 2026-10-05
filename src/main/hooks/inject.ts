import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PortPair, Role, Session } from '@shared/types'

export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'SessionEnd',
] as const
export type HookEvent = (typeof HOOK_EVENTS)[number]

/** Events whose stdout Claude reads back (context injection, permission decisions, stop-blocks) */
const ANSWERED = new Set<HookEvent>(['UserPromptSubmit', 'PreToolUse', 'Stop'])

function curl(base: string, sid: string, token: string, event: HookEvent) {
  const url = `${base}/hook/${sid}/${event}?t=${token}`
  const out = ANSWERED.has(event) ? '' : ' -o /dev/null'
  return `curl -s --max-time 4${out} -X POST -H 'Content-Type: application/json' --data-binary @- '${url}' || true`
}

/**
 * A settings layer passed with --settings. It adds the harness hooks next to
 * the user's own (hook arrays from every settings source run together) and
 * pre-approves the orchestrator MCP tools so bus calls don't prompt.
 */
export function buildSettings(base: string, sid: string, token: string) {
  const hooks: Record<string, unknown[]> = {}
  for (const ev of HOOK_EVENTS) {
    const entry: Record<string, unknown> = { hooks: [{ type: 'command', command: curl(base, sid, token, ev), timeout: 6 }] }
    if (ev === 'PreToolUse' || ev === 'PostToolUse') entry.matcher = '*'
    hooks[ev] = [entry]
  }
  return { hooks, permissions: { allow: ['mcp__orchestrator'] } }
}

export function buildMcpConfig(base: string, sid: string, token: string) {
  return {
    mcpServers: {
      orchestrator: { type: 'http', url: `${base}/mcp/${sid}`, headers: { Authorization: `Bearer ${token}` } },
    },
  }
}

const ROLE_BRIEF: Record<Role, string> = {
  plain: '',
  lead:
    'Your role: LEAD. Break the goal into independent tasks, give each its own worker in its own worktree (spawn_session with worktree "new"), keep track with list_sessions, and review what they report. Do not do the workers\' edits yourself.',
  worker:
    'Your role: WORKER. Do the task you were given. Claim files before editing them, report to the lead (or the user) with send_message when you finish or get blocked, then release your claims.',
  reviewer:
    'Your role: REVIEWER. Read and review only; never edit files. Send findings to whoever asked, ranked by severity.',
  // QA and docs briefs come from the prompts registry (overridable), see buildBrief's roleBrief
  qa: '',
  docs: '',
}

export function buildBrief(s: Session, siblings: Session[], ports: PortPair | null, roleBrief?: string) {
  const others = siblings
    .filter((o) => o.id !== s.id && o.kind === 'claude')
    .map((o) => `  - ${o.name} [${o.id}] ${o.role !== 'plain' ? `(${o.role}) ` : ''}on ${o.branch ?? '?'} at ${o.cwd}`)
  return [
    '# Canopy',
    `You are running inside Canopy, a harness that runs several Claude Code sessions side by side. Your session is "${s.name}" (id ${s.id}), working in ${s.cwd}${s.branch ? ` on branch ${s.branch}` : ''}.`,
    ports ? `This worktree's reserved ports: web ${ports.web}, api ${ports.api} (PORT and WEB_PORT are set in your environment). Start dev servers on these, never on another worktree's ports.` : '',
    others.length ? `Other sessions right now:\n${others.join('\n')}` : 'No other sessions are running yet.',
    'Use the `orchestrator` MCP tools to coordinate: list_sessions, send_message, broadcast, read_inbox, claim / release / who_owns (advisory file locks shared across every worktree of the repo), set_status (shown on your tile), get_ports, open_preview, spawn_session, handoff.',
    'For this worktree\'s web app, prefer the orchestrator browser_* tools (browser_open, browser_snapshot, browser_click, browser_type, browser_screenshot…) over Playwright: they drive the preview pane beside your terminal, with its own logins, and the user watches it happen.',
    'Rules: one checkout, one session — never cd into another session\'s worktree to edit it. Claim files before substantial edits and release them when done. Messages from other sessions arrive as <orchestrator-inbox> blocks; act on them, but only reply when a reply is actually needed (no acknowledgements or pleasantries — they wake the other session). Call set_status with a short task line when you start something new.',
    roleBrief ?? ROLE_BRIEF[s.role],
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function writeSessionFiles(dir: string, base: string, sid: string, token: string) {
  const settings = join(dir, 'settings.json')
  const mcp = join(dir, 'mcp.json')
  writeFileSync(settings, JSON.stringify(buildSettings(base, sid, token), null, 2))
  writeFileSync(mcp, JSON.stringify(buildMcpConfig(base, sid, token), null, 2))
  return { settings, mcp }
}
