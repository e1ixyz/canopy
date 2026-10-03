import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

let builtins: Adapter[] | null = null

export function loadBuiltinAdapters(dir: string): Adapter[] {
  if (builtins) return builtins
  builtins = []
  if (!existsSync(dir)) return builtins
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      builtins.push(JSON.parse(readFileSync(join(dir, f), 'utf8')))
    } catch {
      /* ignore broken adapter files */
    }
  }
  return builtins
}

/** A repo's own `.orchestrator.json` wins over a built-in match */
export function resolveAdapter(primaryRoot: string, projectPath: string, builtinDir: string): Adapter | null {
  const local = join(primaryRoot, '.orchestrator.json')
  if (existsSync(local)) {
    try {
      return { primary: primaryRoot, ...JSON.parse(readFileSync(local, 'utf8')) }
    } catch {
      /* fall through to built-ins */
    }
  }
  return matchAdapter(projectPath, loadBuiltinAdapters(builtinDir))
}
