import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import type { BranchSuggestion } from '@shared/types'
import { slugify } from './handoffs'
import { loginEnv, resolveClaude } from './env'
import { branches } from './worktree/git'

const ASK = 'Name a git branch for this task. Reply with only a kebab-case slug of 2 to 5 lowercase words, nothing else. Task: '
const TIMEOUT_MS = 10_000

/** Model output to a branch-safe slug, or '' if nothing usable came back */
export function cleanSlug(text: string): string {
  const line = text.trim().split('\n').pop() ?? ''
  const slug = line
    .toLowerCase()
    .replace(/^[`'"\s]+|[`'"\s.]+$/g, '')
    .replace(/^[a-z]+\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const words = slug.split('-').filter(Boolean).slice(0, 5)
  return words.length ? words.join('-').slice(0, 48).replace(/-+$/, '') : ''
}

/**
 * The prefix new branches get: the adapter's, else the one most of the repo's recent
 * local branches use (feat/, fix/…), else orch/.
 */
export function pickPrefix(recent: string[], adapterPrefix?: string): string {
  if (adapterPrefix) return adapterPrefix.endsWith('/') ? adapterPrefix : `${adapterPrefix}/`
  const counts = new Map<string, number>()
  for (const b of recent.slice(0, 40)) {
    const m = /^([a-z0-9._-]+)\//i.exec(b)
    if (m && !['origin', 'upstream', 'orch'].includes(m[1])) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1])
  return best && best[1] >= 2 ? `${best[0]}/` : 'orch/'
}

/** `name`, or `name-2`, `name-3`… whichever no local or remote branch has taken */
export function uniqueBranch(name: string, existing: Iterable<string>): string {
  const taken = new Set<string>()
  for (const b of existing) taken.add(b.replace(/^(origin|upstream)\//, ''))
  if (!taken.has(name)) return name
  for (let i = 2; ; i++) if (!taken.has(`${name}-${i}`)) return `${name}-${i}`
}

/** One-shot Haiku call on the user's own Claude Code login: no hooks, tools, MCP or saved session */
async function askClaude(task: string): Promise<string> {
  const [bin, env] = await Promise.all([resolveClaude(), loginEnv()])
  return new Promise((resolve) => {
    execFile(
      bin,
      ['-p', '--model', 'haiku', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--tools', '', '--settings', '{"disableAllHooks":true}', ASK + task.slice(0, 2000)],
      { cwd: tmpdir(), env, timeout: TIMEOUT_MS, maxBuffer: 1 << 16 },
      (err, stdout) => resolve(err ? '' : cleanSlug(stdout)),
    )
  })
}

/** A branch for a new worktree, named from the task the session is about to start */
export async function suggestBranch(projectPath: string, task: string, adapterPrefix?: string): Promise<BranchSuggestion> {
  const [refs, fromModel] = await Promise.all([branches(projectPath), task.trim() ? askClaude(task) : Promise.resolve('')])
  const local = refs.filter((b) => !/^(origin|upstream)\//.test(b))
  const slug = fromModel || (task.trim() ? slugify(task) : 'task')
  return { branch: uniqueBranch(pickPrefix(local, adapterPrefix) + slug, refs), source: fromModel ? 'claude' : 'prompt' }
}
