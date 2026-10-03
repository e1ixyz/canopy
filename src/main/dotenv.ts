import { readFileSync } from 'node:fs'

/** Minimal .env parser: KEY=value, `export`, quotes, # comments. No interpolation. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = /^(?:export\s+)?([A-Za-z_][\w.]*)\s*=\s*(.*)$/.exec(line)
    if (!m) continue
    let v = m[2]
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1).replace(/\\n/g, m[2][0] === '"' ? '\n' : '\\n')
    else v = v.replace(/\s+#.*$/, '').trim()
    out[m[1]] = v
  }
  return out
}

export function readEnvFile(path: string): Record<string, string> {
  try {
    return parseEnv(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
}

/** host:port/db of a database URL, without credentials */
export function describeDbUrl(url: string) {
  try {
    const u = new URL(url)
    return { host: u.hostname, port: u.port || '5432', database: u.pathname.replace(/^\//, '') || '(default)', user: u.username ? decodeURIComponent(u.username) : undefined }
  } catch {
    return null
  }
}
