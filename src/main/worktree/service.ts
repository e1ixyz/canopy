import { existsSync, lstatSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Adapter, NewWorktreeRequest, PortPair, Worktree } from '@shared/types'
import { sh, shTry } from '../env'
import { fill, resolveAdapter } from './adapters'
import { branches, defaultBase, hasUnsafeState, listWorktrees, primaryRoot } from './git'
import { allocatePorts, parseClaimedPorts, rewriteEnvPorts, slugify } from './ports'

export interface WorktreeDeps {
  reservations: () => Record<string, PortPair>
  reserve: (path: string, ports: PortPair | null) => void
  listening: () => Set<number>
  builtinDir: string
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '')

export class WorktreeService {
  constructor(private deps: WorktreeDeps) {}

  async adapter(projectPath: string): Promise<Adapter | null> {
    const root = await primaryRoot(projectPath)
    return resolveAdapter(root, projectPath, this.deps.builtinDir)
  }

  /** Ports a worktree uses: our reservation, else what its env files claim */
  portsFor(path: string): PortPair | null {
    const r = this.deps.reservations()[path]
    if (r) return r
    const claimed = parseClaimedPorts(read(join(path, '.wt-run.sh')), read(join(path, '.env')))
    return claimed.api || claimed.web ? { web: claimed.web ?? 0, api: claimed.api ?? 0 } : null
  }

  async list(projectPath: string): Promise<Worktree[]> {
    const wts = await listWorktrees(projectPath)
    return wts.map((w) => ({ ...w, ports: this.portsFor(w.path) }))
  }

  async create(req: NewWorktreeRequest): Promise<Worktree> {
    const primary = await primaryRoot(req.projectPath)
    const adapter = await this.adapter(req.projectPath)
    const base = req.base || (await defaultBase(primary))
    const slug = slugify(req.branch)
    if (!slug) throw new Error('Branch name is empty')
    const before = new Set((await listWorktrees(primary)).map((w) => w.path))

    if (adapter?.worktree?.create) {
      const cmd = fill(adapter.worktree.create, { branch: req.branch, base, primary: adapter.primary ?? primary, slug })
      await sh(process.env.SHELL || '/bin/zsh', ['-lc', cmd], primary, 10 * 60_000)
    } else {
      await this.defaultCreate(primary, req.branch, base, slug)
    }

    const after = await listWorktrees(primary)
    const created =
      after.find((w) => !before.has(w.path)) ?? after.find((w) => w.branch === req.branch) ?? null
    if (!created) throw new Error(`Worktree for ${req.branch} was not created`)

    // Record what the worktree claims so the next allocation can't hand it out again.
    let ports = this.deps.reservations()[created.path] ?? this.portsFor(created.path)
    if (ports && adapter?.worktree?.create) ports = this.repairCollisions(created.path, ports, after.map((w) => w.path))
    if (ports) this.deps.reserve(created.path, ports)
    return { ...created, ports }
  }

  /**
   * Adapter scripts that pick ports by "is anything listening now" hand a stopped
   * worktree's pair to the next one. If the new tree collides with a sibling's
   * claim, move it to a free pair by rewriting its local-only env/run files.
   */
  private repairCollisions(path: string, ports: PortPair, all: string[]): PortPair {
    const others: Record<string, PortPair> = { ...this.deps.reservations() }
    for (const p of all) {
      if (p === path || others[p]) continue
      const claimed = this.portsFor(p)
      if (claimed) others[p] = claimed
    }
    delete others[path]
    const used = new Set(Object.values(others).flatMap((r) => [r.web, r.api]))
    if (!used.has(ports.web) && !used.has(ports.api)) return ports
    const next = allocatePorts(others, this.deps.listening())
    for (const f of ['.wt-run.sh', '.env']) {
      const file = join(path, f)
      if (!existsSync(file)) continue
      const body = read(file)
        .replace(new RegExp(`([:=])${ports.api}\\b`, 'g'), `$1${next.api}`)
        .replace(new RegExp(`([:=])${ports.web}\\b`, 'g'), `$1${next.web}`)
      writeFileSync(file, body)
    }
    return next
  }

  private async defaultCreate(primary: string, branch: string, base: string, slug: string) {
    const path = join(dirname(primary), `${basename(primary)}-wt-${slug}`)
    if (existsSync(path)) throw new Error(`${path} already exists`)
    const exists = (await branches(primary)).includes(branch)
    if (exists) await sh('git', ['worktree', 'add', path, branch], primary, 120_000)
    else await sh('git', ['worktree', 'add', '-b', branch, path, base], primary, 120_000)

    // Count what sibling worktrees declare in their own files too, not just our reservations.
    const taken: Record<string, PortPair> = { ...this.deps.reservations() }
    for (const w of await listWorktrees(primary)) {
      const claimed = taken[w.path] ? null : this.portsFor(w.path)
      if (claimed) taken[w.path] = claimed
    }
    const ports = allocatePorts(taken, this.deps.listening())
    this.deps.reserve(path, ports)

    for (const env of ['.env', '.env.local']) {
      const src = join(primary, env)
      if (existsSync(src) && !existsSync(join(path, env))) writeFileSync(join(path, env), rewriteEnvPorts(read(src), ports))
    }
    // One canonical handoff across worktrees, like the etwal harness does it.
    const handoff = join(primary, 'HANDOFF.md')
    const target = join(path, 'HANDOFF.md')
    if (existsSync(handoff) && !existsSync(target)) symlinkSync(handoff, target)
  }

  async remove(path: string, force: boolean): Promise<{ ok: boolean; reason?: string }> {
    const primary = await primaryRoot(path)
    if (primary === path) return { ok: false, reason: 'Refusing to remove the primary checkout' }
    if (!force) {
      const reason = await hasUnsafeState(path)
      if (reason) return { ok: false, reason }
    }
    const adapter = await this.adapter(path)
    if (adapter?.worktree?.remove) {
      await sh(process.env.SHELL || '/bin/zsh', ['-lc', fill(adapter.worktree.remove, { path, primary })], primary, 120_000)
    } else {
      // A HANDOFF symlink is untracked; drop it so `worktree remove` doesn't call the tree dirty.
      const h = join(path, 'HANDOFF.md')
      if (existsSync(h) && lstatSync(h).isSymbolicLink()) await shTry('rm', [h])
      await sh('git', ['worktree', 'remove', ...(force ? ['--force'] : []), path], primary, 60_000)
    }
    this.deps.reserve(path, null)
    return { ok: true }
  }

  /** The command that brings up a worktree's dev stack, with its ports exported */
  async devCommand(cwd: string, projectPath: string): Promise<{ cmd: string; ports: PortPair | null; previewPath: string }> {
    const adapter = await this.adapter(projectPath)
    const ports = this.portsFor(cwd)
    const previewPath = adapter?.previewPath ?? '/'
    if (adapter?.worktree?.run && existsSync(join(cwd, adapter.worktree.run.replace(/^\.\//, '').split(' ')[0]))) {
      return { cmd: adapter.worktree.run, ports, previewPath }
    }
    let cmd = adapter?.devCommand
    if (!cmd) {
      const pkg = join(cwd, 'package.json')
      const pm = existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))
        ? 'bun'
        : existsSync(join(cwd, 'pnpm-lock.yaml'))
          ? 'pnpm'
          : existsSync(join(cwd, 'yarn.lock'))
            ? 'yarn'
            : 'npm'
      if (existsSync(pkg)) {
        const scripts = (JSON.parse(read(pkg)).scripts ?? {}) as Record<string, string>
        const script = ['dev', 'start', 'serve'].find((s) => scripts[s])
        const install = existsSync(join(cwd, 'node_modules')) ? '' : `${pm} install && `
        cmd = script ? `${install}${pm} run ${script}` : undefined
      }
    }
    if (!cmd) throw new Error('No dev command found. Add "devCommand" to .orchestrator.json')
    if (ports) {
      const env = [`PORT=${ports.api}`, `WEB_PORT=${ports.web}`, `API_PROXY_TARGET=http://localhost:${ports.api}`]
      cmd = `${env.join(' ')} ${cmd}`
    }
    return { cmd, ports, previewPath }
  }
}
