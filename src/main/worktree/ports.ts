import type { PortPair } from '@shared/types'

/**
 * Ports come from the harness's own reservations, not from "is anything
 * listening right now". A worktree whose stack is stopped keeps its pair, so a
 * new worktree can't be handed the same ports (the etwal `:3001` pile-up).
 */
export function allocatePorts(
  reservations: Record<string, PortPair>,
  listening: Set<number>,
  base: PortPair = { web: 5174, api: 3001 },
): PortPair {
  const taken = new Set<number>(listening)
  for (const r of Object.values(reservations)) {
    taken.add(r.web)
    taken.add(r.api)
  }
  let web = base.web
  while (taken.has(web)) web++
  taken.add(web)
  let api = base.api
  while (taken.has(api)) api++
  return { web, api }
}

/** Rewrite (or append) port keys in a dotenv file body */
export function rewriteEnvPorts(
  body: string,
  ports: PortPair,
  keys: { web: string[]; api: string[] } = { web: ['WEB_PORT', 'VITE_PORT'], api: ['PORT', 'API_PORT'] },
): string {
  const lines = body.split('\n')
  const seen = new Set<string>()
  const value = (k: string) => (keys.web.includes(k) ? ports.web : ports.api)
  const out = lines.map((line) => {
    const m = /^\s*(export\s+)?([A-Z0-9_]+)\s*=/.exec(line)
    if (!m) return line
    const k = m[2]
    if (keys.web.includes(k) || keys.api.includes(k)) {
      seen.add(k)
      return `${m[1] ?? ''}${k}=${value(k)}`
    }
    return line
  })
  const missing = [keys.api[0], keys.web[0]].filter((k) => !seen.has(k))
  if (missing.length) {
    if (out.length && out[out.length - 1] !== '') out.push('')
    out.push('# --- worktree ports (added by orchestrator) ---')
    for (const k of missing) out.push(`${k}=${value(k)}`)
    out.push('')
  }
  return out.join('\n')
}

/** Pull the port pair a worktree already claims out of its env/run files */
export function parseClaimedPorts(...bodies: string[]): Partial<PortPair> {
  const found: Partial<PortPair> = {}
  for (const body of bodies) {
    const api = /(?:^|\s)(?:export\s+)?PORT=(\d{2,5})/m.exec(body)
    const web = /(?:^|\s)(?:export\s+)?(?:WEB_PORT|VITE_PORT)=(\d{2,5})/m.exec(body)
    if (api && !found.api) found.api = Number(api[1])
    if (web && !found.web) found.web = Number(web[1])
  }
  return found
}

export function slugify(branch: string) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
