import { shTry } from './env'

export interface Listener {
  pid: number
  port: number
  cwd?: string
  command?: string
}

export interface WatchedProc {
  id: string
  pid?: number
  cwd: string
}

export function parseLsofListen(out: string): { pid: number; port: number; command?: string }[] {
  const res: { pid: number; port: number; command?: string }[] = []
  let pid = 0
  let command: string | undefined
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) {
      pid = Number(line.slice(1))
      command = undefined
    } else if (line.startsWith('c')) command = line.slice(1)
    else if (line.startsWith('n')) {
      const m = /:(\d+)$/.exec(line)
      if (!m) continue
      const port = Number(m[1])
      const k = `${pid}:${port}`
      if (!seen.has(k)) res.push(command ? { pid, port, command } : { pid, port })
      seen.add(k)
    }
  }
  return res
}

export function parseLsofCwd(out: string): Map<number, string> {
  const map = new Map<number, string>()
  let pid = 0
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1))
    else if (line.startsWith('n') && pid) map.set(pid, line.slice(1))
  }
  return map
}

export function parsePs(out: string): Map<number, number> {
  const parent = new Map<number, number>()
  for (const line of out.split('\n')) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number)
    if (pid) parent.set(pid, ppid)
  }
  return parent
}

function descends(pid: number, ancestor: number, parent: Map<number, number>) {
  let cur: number | undefined = pid
  for (let i = 0; cur && i < 64; i++) {
    if (cur === ancestor) return true
    cur = parent.get(cur)
  }
  return false
}

/**
 * Attribute listening ports to sessions: a port belongs to a session if the
 * listener runs under that session's PTY, or (for servers started elsewhere)
 * if the listener's cwd is inside the session's worktree. Deepest cwd wins,
 * because a port alone says nothing about who owns it.
 */
export function attribute(listeners: Listener[], procs: WatchedProc[], parent: Map<number, number>, ignore: Set<number>) {
  const out = new Map<string, number[]>()
  for (const p of procs) out.set(p.id, [])
  for (const l of listeners) {
    if (ignore.has(l.port)) continue
    const byTree = procs.filter((p) => p.pid && descends(l.pid, p.pid, parent))
    let owners = byTree
    if (!owners.length && l.cwd) {
      const matches = procs.filter((p) => l.cwd === p.cwd || l.cwd!.startsWith(p.cwd + '/'))
      const depth = Math.max(0, ...matches.map((m) => m.cwd.length))
      owners = matches.filter((m) => m.cwd.length === depth)
    }
    for (const o of owners) {
      const list = out.get(o.id)!
      if (!list.includes(l.port)) list.push(l.port)
    }
  }
  for (const list of out.values()) list.sort((a, b) => a - b)
  return out
}

export class PortWatcher {
  private timer: NodeJS.Timeout | null = null
  private last = new Map<string, string>()
  listening = new Set<number>()
  /** every listener from the last scan, with the session it was attributed to */
  listeners: (Listener & { sessionId?: string })[] = []

  constructor(
    private procs: () => WatchedProc[],
    private onChange: (id: string, ports: number[]) => void,
    private ignore: () => Set<number>,
  ) {}

  start(interval = 2500) {
    const tick = async () => {
      await this.scan().catch(() => {})
      this.timer = setTimeout(tick, interval)
    }
    tick()
  }

  stop() {
    if (this.timer) clearTimeout(this.timer)
  }

  async scan() {
    const procs = this.procs()
    const listen = await shTry('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn'], undefined, 8000)
    if (listen === null) return
    const raw = parseLsofListen(listen)
    this.listening = new Set(raw.map((r) => r.port))
    if (!procs.length) {
      this.last.clear()
      this.listeners = raw.filter((r) => !this.ignore().has(r.port))
      return
    }
    const pids = [...new Set(raw.map((r) => r.pid))]
    const [cwdOut, psOut] = await Promise.all([
      pids.length ? shTry('lsof', ['-a', '-d', 'cwd', '-p', pids.join(','), '-F', 'n'], undefined, 8000) : '',
      shTry('ps', ['-axo', 'pid=,ppid='], undefined, 5000),
    ])
    const cwd = parseLsofCwd(cwdOut ?? '')
    const listeners = raw.map((r) => ({ ...r, cwd: cwd.get(r.pid) }))
    const result = attribute(listeners, procs, parsePs(psOut ?? ''), this.ignore())
    const ownerOf = new Map<number, string>()
    for (const [id, ports] of result) for (const p of ports) if (!ownerOf.has(p)) ownerOf.set(p, id)
    this.listeners = listeners.filter((l) => !this.ignore().has(l.port)).map((l) => ({ ...l, sessionId: ownerOf.get(l.port) }))
    // Sessions that exited drop out of procs(); forget their last report so a restart re-announces ports.
    for (const id of [...this.last.keys()]) if (!result.has(id)) this.last.delete(id)
    for (const [id, ports] of result) {
      const key = ports.join(',')
      if (this.last.get(id) !== key) {
        this.last.set(id, key)
        this.onChange(id, ports)
      }
    }
  }
}
