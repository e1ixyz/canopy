import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

let cached: Record<string, string> | null = null
let claudeBin: string | null = null

/**
 * Apps launched from Finder get a minimal PATH. Ask the user's login shell for
 * its real environment once, so `claude`, `bun`, `gh` etc. resolve the same way
 * they do in a terminal.
 */
export async function loginEnv(): Promise<Record<string, string>> {
  if (cached) return cached
  const shell = process.env.SHELL || '/bin/zsh'
  // Start the login shell from a clean slate: whatever launched the app (a
  // terminal, another Claude session, an IDE) must not leak its markers into
  // the sessions we spawn.
  const seed: Record<string, string> = {
    HOME: homedir(),
    USER: process.env.USER ?? '',
    LOGNAME: process.env.LOGNAME ?? process.env.USER ?? '',
    SHELL: shell,
    TERM: 'xterm-256color',
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  }
  let base: Record<string, string> = { ...seed }
  try {
    const { stdout } = await run(shell, ['-ilc', 'env -0'], { timeout: 8000, maxBuffer: 4 << 20, env: seed })
    for (const entry of stdout.split('\0')) {
      const i = entry.indexOf('=')
      if (i > 0) base[entry.slice(0, i)] = entry.slice(i + 1)
    }
  } catch {
    base = { ...seed }
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) base[k] = v
    base.PATH = [base.PATH, '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin'), join(homedir(), '.bun/bin')]
      .filter(Boolean)
      .join(':')
  }
  // Session markers a parent Claude Code sets; user-chosen CLAUDE_CODE_* settings from their profile stay.
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_CODE_SESSION_ID', 'TERM_PROGRAM_VERSION'])
    delete base[k]
  for (const k of Object.keys(base)) if (k.startsWith('ELECTRON_') || k.startsWith('VSCODE_')) delete base[k]
  delete base.SHLVL
  delete base.OLDPWD
  delete base.PWD
  delete base._
  cached = base
  return base
}

export async function resolveClaude(): Promise<string> {
  if (claudeBin) return claudeBin
  const env = await loginEnv()
  for (const dir of (env.PATH || '').split(':')) {
    const p = join(dir, 'claude')
    if (dir && existsSync(p)) return (claudeBin = p)
  }
  const fallback = join(homedir(), '.local/bin/claude')
  return (claudeBin = existsSync(fallback) ? fallback : 'claude')
}

export async function sh(cmd: string, args: string[], cwd?: string, timeout = 15000) {
  const env = await loginEnv()
  const { stdout } = await run(cmd, args, { cwd, env, timeout, maxBuffer: 16 << 20 })
  return stdout
}

export async function shTry(cmd: string, args: string[], cwd?: string, timeout = 15000) {
  try {
    return await sh(cmd, args, cwd, timeout)
  } catch {
    return null
  }
}

/** Run a shell command line in a login shell; never rejects. Output is capped. */
export async function runCommand(cwd: string, cmd: string, timeout = 5 * 60_000): Promise<{ code: number; out: string }> {
  const env = await loginEnv()
  return new Promise((resolve) => {
    const child = spawn(env.SHELL || '/bin/zsh', ['-lc', cmd], { cwd, env })
    let out = ''
    const add = (b: Buffer) => {
      out += b.toString('utf8')
      if (out.length > 128_000) out = out.slice(-64_000)
    }
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: 127, out: String(e) })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, out: out.slice(-64_000) })
    })
  })
}
