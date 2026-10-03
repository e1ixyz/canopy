import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Adapter } from '@shared/types'

export function matchAdapter(projectPath: string, adapters: Adapter[]): Adapter | null {
  let best: Adapter | null = null
  for (const a of adapters) {
    if (!a.match || !projectPath.startsWith(a.match)) continue
    if (!best || a.match.length > (best.match?.length ?? 0)) best = a
  }
  return best
}

/**
 * Substitute {branch} {base} {primary} {path} {slug} {web} {api} in a command
 * template. Inside double quotes a value is escaped for that context; bare
 * values are single-quoted when they hold anything a shell would split on.
 */
export function fill(template: string, vars: Record<string, string | number | undefined>) {
  let out = ''
  let inDouble = false
  for (let i = 0; i < template.length; i++) {
    const c = template[i]
    if (c === '\\') {
      out += c + (template[i + 1] ?? '')
      i++
      continue
    }
    if (c === '"') inDouble = !inDouble
    if (c === '{') {
      const m = /^\{(\w+)\}/.exec(template.slice(i))
      const v = m ? vars[m[1]] : undefined
      if (m && v !== undefined) {
        const s = String(v)
        out += inDouble ? s.replace(/["$`\\]/g, '\\$&') : /^[\w./:@-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`
        i += m[0].length - 1
        continue
      }
    }
    out += c
  }
  return out
}

const tilde = (p?: string) => (p?.startsWith('~/') ? join(homedir(), p.slice(2)) + (p.endsWith('/') ? '/' : '') : p)

/** `match` and `primary` may start with ~/ so adapters stay portable */
export function expandHome(a: Adapter): Adapter {
  return { ...a, match: tilde(a.match), primary: tilde(a.primary) }
}

let cache: { dir: string; mtime: number; list: Adapter[] } | null = null

/** Adapters in the user's adapters folder, re-read whenever the folder changes */
export function loadUserAdapters(dir: string): Adapter[] {
  let mtime = 0
  try {
    mtime = statSync(dir).mtimeMs
  } catch {
    return []
  }
  if (cache && cache.dir === dir && cache.mtime === mtime) return cache.list
  const list: Adapter[] = []
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      list.push(expandHome(JSON.parse(readFileSync(join(dir, f), 'utf8'))))
    } catch {
      /* ignore broken adapter files */
    }
  }
  cache = { dir, mtime, list }
  return list
}

/** A repo's own `.orchestrator.json` wins over a match in the user's adapters folder */
export function resolveAdapter(primaryRoot: string, projectPath: string, userDir: string): Adapter | null {
  const local = join(primaryRoot, '.orchestrator.json')
  if (existsSync(local)) {
    try {
      return { primary: primaryRoot, ...JSON.parse(readFileSync(local, 'utf8')) }
    } catch {
      /* fall through to the user's adapters */
    }
  }
  return matchAdapter(projectPath, loadUserAdapters(userDir))
}
