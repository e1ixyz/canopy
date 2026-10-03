import { dirname, resolve } from 'node:path'
import type { Conflict, GitStatus, Worktree } from '@shared/types'
import { sh, shTry } from '../env'

export async function isGitRepo(path: string) {
  return (await shTry('git', ['rev-parse', '--is-inside-work-tree'], path, 5000))?.trim() === 'true'
}

/** The primary checkout: the dir that owns the shared .git (not a linked worktree) */
export async function primaryRoot(path: string): Promise<string> {
  const common = (await shTry('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], path, 5000))?.trim()
  if (!common) return path
  return common.endsWith('/.git') ? dirname(common) : resolve(common, '..')
}

export function parseWorktreeList(porcelain: string): Omit<Worktree, 'ports'>[] {
  const out: Omit<Worktree, 'ports'>[] = []
  let cur: Partial<Omit<Worktree, 'ports'>> & { bare?: boolean } = {}
  const flush = () => {
    if (cur.path && !cur.bare) out.push({ path: cur.path, branch: cur.branch ?? '(detached)', head: cur.head ?? '', isPrimary: out.length === 0 })
    cur = {}
  }
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      flush()
      cur.path = line.slice(9)
    } else if (line.startsWith('HEAD ')) cur.head = line.slice(5, 12)
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace(/^refs\/heads\//, '')
    else if (line === 'bare') cur.bare = true
    else if (line === 'detached') cur.branch = '(detached)'
  }
  flush()
  return out
}

export async function listWorktrees(path: string) {
  const out = await shTry('git', ['worktree', 'list', '--porcelain'], path, 8000)
  return out ? parseWorktreeList(out) : []
}

export async function branches(path: string): Promise<string[]> {
  const out = await shTry('git', ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], path)
  return (out ?? '').split('\n').filter((b) => b && !b.endsWith('/HEAD'))
}

/** origin/develop if the repo has one (the etwal convention), else origin's default, else main/master */
export async function defaultBase(path: string): Promise<string> {
  const refs = new Set(await branches(path))
  if (refs.has('origin/develop')) return 'origin/develop'
  const head = (await shTry('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], path))?.trim()
  if (head) return head
  for (const b of ['origin/main', 'origin/master', 'main', 'master', 'develop']) if (refs.has(b)) return b
  return 'HEAD'
}

export function parseStatusV2(out: string): Omit<GitStatus, 'pr'> {
  let branch = '(detached)'
  let ahead = 0
  let behind = 0
  let upstream: string | undefined
  let dirty = 0
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) branch = line.slice(14)
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice(18)
    else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line && !line.startsWith('#')) dirty++
  }
  return { branch, ahead, behind, dirty, upstream }
}

const prCache = new Map<string, { at: number; pr: GitStatus['pr'] }>()

export async function gitStatus(cwd: string): Promise<GitStatus | null> {
  const out = await shTry('git', ['status', '--porcelain=v2', '--branch'], cwd, 8000)
  if (out === null) return null
  const s: GitStatus = { ...parseStatusV2(out), pr: null }
  const key = `${cwd}#${s.branch}`
  const hit = prCache.get(key)
  if (hit && Date.now() - hit.at < 90_000) s.pr = hit.pr
  else if (s.upstream) {
    // gh is network-bound; refresh in the background and serve the cache
    prCache.set(key, { at: Date.now(), pr: hit?.pr ?? null })
    shTry('gh', ['pr', 'view', '--json', 'number,url,state'], cwd, 15000).then((json) => {
      try {
        prCache.set(key, { at: Date.now(), pr: json ? JSON.parse(json) : null })
      } catch {
        /* not a PR branch */
      }
    })
  }
  return s
}

async function changedFiles(wt: string, base: string): Promise<Set<string>> {
  const files = new Set<string>()
  const mb = (await shTry('git', ['merge-base', 'HEAD', base], wt))?.trim()
  if (mb) for (const f of ((await shTry('git', ['diff', '--name-only', mb], wt)) ?? '').split('\n')) if (f) files.add(f)
  for (const line of ((await shTry('git', ['status', '--porcelain'], wt)) ?? '').split('\n'))
    if (line.length > 3) files.add(line.slice(3).replace(/^.* -> /, ''))
  return files
}

/** Files touched in more than one worktree of the same repo */
export async function conflicts(projectPath: string): Promise<Conflict[]> {
  const wts = await listWorktrees(projectPath)
  if (wts.length < 2) return []
  const base = await defaultBase(projectPath)
  const owners = new Map<string, string[]>()
  await Promise.all(
    wts.map(async (w) => {
      for (const f of await changedFiles(w.path, base)) {
        const list = owners.get(f) ?? []
        list.push(w.path)
        owners.set(f, list)
      }
    }),
  )
  return [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([file, worktrees]) => ({ file, worktrees }))
    .sort((a, b) => a.file.localeCompare(b.file))
}

export async function hasUnsafeState(wt: string): Promise<string | null> {
  const dirty = ((await shTry('git', ['status', '--porcelain'], wt)) ?? '').trim()
  if (dirty) return `${dirty.split('\n').length} uncommitted change(s)`
  const unpushed = await shTry('git', ['log', '--oneline', '@{u}..'], wt)
  if (unpushed === null) {
    const local = ((await shTry('git', ['log', '--oneline', '-1'], wt)) ?? '').trim()
    if (local) return 'branch has no upstream (commits may be unpushed)'
  } else if (unpushed.trim()) return `${unpushed.trim().split('\n').length} unpushed commit(s)`
  return null
}

export { sh }
