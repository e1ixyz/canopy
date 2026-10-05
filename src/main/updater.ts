import { execFile, spawn } from 'node:child_process'
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { UpdateCommit, UpdateState } from '@shared/types'
import { loginEnv } from './env'

const run = promisify(execFile)

const HOURLY = 60 * 60 * 1000

/** `git log --format=%h%x09%s` output, newest first */
export function parseCommits(out: string): UpdateCommit[] {
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('\t')
      return i < 0 ? { sha: line, subject: '' } : { sha: line.slice(0, i), subject: line.slice(i + 1) }
    })
}

/**
 * Self-update for builds made by scripts/install-app.sh: those record the commit they were
 * built from and the checkout they came from. The updater fetches that checkout's origin/main
 * with the user's own git credentials (so a private repo works), and when it is ahead, pulls,
 * rebuilds in the background, and installs on restart.
 */
export class Updater {
  readonly source = __SOURCE_DIR__
  readonly built = __BUILD_SHA__
  private state: UpdateState
  private timer: NodeJS.Timeout | null = null
  private log = join(app.getPath('userData'), 'update.log')

  constructor(private emit: (s: UpdateState) => void) {
    this.state = { phase: 'idle', enabled: this.enabled(), built: this.built.slice(0, 7) }
  }

  enabled() {
    return app.isPackaged && !!this.source && !!this.built && existsSync(join(this.source, '.git'))
  }

  get() {
    return this.state
  }

  start() {
    if (!this.state.enabled) return
    setTimeout(() => this.check(false), 20_000)
    this.timer = setInterval(() => this.check(false), HOURLY)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
  }

  private set(next: Partial<UpdateState>) {
    this.state = { ...this.state, ...next }
    this.emit(this.state)
  }

  private async git(...args: string[]) {
    const { stdout } = await run('git', args, { cwd: this.source, env: await loginEnv(), timeout: 60_000, maxBuffer: 4 << 20 })
    return stdout.trim()
  }

  /** Manual checks report failures; automatic ones stay quiet and keep the last good state */
  async check(manual: boolean): Promise<UpdateState> {
    if (!this.state.enabled) return this.state
    if (this.state.phase === 'building' || this.state.phase === 'ready') return this.state
    try {
      await this.git('fetch', '--quiet', 'origin', 'main')
      const latest = await this.git('rev-parse', 'origin/main')
      const known = await this.git('cat-file', '-e', `${this.built}^{commit}`).then(
        () => true,
        () => false,
      )
      const behind = known ? Number(await this.git('rev-list', '--count', `${this.built}..origin/main`)) : latest === this.built ? 0 : 1
      if (!behind) {
        this.set({ phase: 'idle', latest: latest.slice(0, 7), commits: [], behind: 0, checkedAt: Date.now(), error: undefined })
        return this.state
      }
      const commits = known ? parseCommits(await this.git('log', '--format=%h%x09%s', '-n', '20', `${this.built}..origin/main`)) : []
      this.set({ phase: 'available', latest: latest.slice(0, 7), behind, commits, checkedAt: Date.now(), error: undefined })
    } catch (e) {
      if (manual) this.set({ phase: 'error', error: `Couldn't reach GitHub: ${firstLine(e)}` })
    }
    return this.state
  }

  /** Pull, install dependencies when the lockfile moved, and build into dist/ while the app keeps running */
  async prepare() {
    if (!this.state.enabled || this.state.phase === 'building') return
    const env = await loginEnv()
    try {
      this.set({ phase: 'building', step: 'Pulling from GitHub', error: undefined })
      const branch = await this.git('rev-parse', '--abbrev-ref', 'HEAD')
      if (branch !== 'main') throw new Error(`The checkout at ${this.source} is on ${branch}, not main`)
      const before = await this.git('rev-parse', 'HEAD')
      await this.git('merge', '--ff-only', 'origin/main')
      const deps = await this.git('diff', '--name-only', before, 'HEAD', '--', 'bun.lock', 'package.json')
      if (deps) {
        this.set({ step: 'Installing dependencies' })
        await this.script('bun', ['install'], env)
      }
      this.set({ step: 'Building' })
      await this.script('/bin/bash', ['scripts/install-app.sh', '--build-only'], env)
      this.set({ phase: 'ready', step: undefined })
    } catch (e) {
      this.set({ phase: 'error', step: undefined, error: firstLine(e) })
    }
  }

  private script(cmd: string, args: string[], env: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const fd = openSync(this.log, 'a')
      const p = spawn(cmd, args, { cwd: this.source, env, stdio: ['ignore', fd, fd] })
      p.on('error', (e) => {
        closeSync(fd)
        reject(e)
      })
      p.on('exit', (code) => {
        closeSync(fd)
        if (code === 0) resolve()
        else reject(new Error(`${[cmd, ...args].join(' ')} failed (exit ${code}). ${this.tail()}`))
      })
    })
  }

  private tail() {
    try {
      const lines = readFileSync(this.log, 'utf8').trim().split('\n')
      return lines.slice(-3).join(' ')
    } catch {
      return ''
    }
  }

  /** Hand off to install-app.sh, which waits for this process to exit, swaps the app and reopens it */
  async install() {
    if (this.state.phase !== 'ready') return
    const fd = openSync(this.log, 'a')
    spawn('/bin/bash', ['scripts/install-app.sh', '--install-only', '--wait-pid', String(process.pid), '--open'], {
      cwd: this.source,
      env: await loginEnv(),
      detached: true,
      stdio: ['ignore', fd, fd],
    }).unref()
    closeSync(fd)
    app.quit()
  }

  dismissError() {
    if (this.state.phase === 'error') this.set({ phase: this.state.behind ? 'available' : 'idle', error: undefined })
  }
}

function firstLine(e: unknown) {
  const err = e as { stderr?: string; message?: string }
  return (err.stderr?.trim() || err.message || String(e)).split('\n')[0]
}
