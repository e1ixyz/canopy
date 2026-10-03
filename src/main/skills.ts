import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SkillInfo } from '@shared/types'

/** name and description from SKILL.md frontmatter (handles `>`/`|` blocks and quotes) */
export function parseSkill(text: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const lines = m[1].split(/\r?\n/)
  const out: Record<string, string> = {}
  for (let i = 0; i < lines.length; i++) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    let v = kv[2].trim()
    if (/^[>|][-+]?$/.test(v)) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim())
      v = block.filter(Boolean).join(' ')
    }
    out[kv[1]] = v.replace(/^(['"])(.*)\1$/, '$2')
  }
  return { name: out.name, description: out.description }
}

function scan(dir: string, source: SkillInfo['source'], prefix = ''): SkillInfo[] {
  if (!existsSync(dir)) return []
  const out: SkillInfo[] = []
  for (const d of readdirSync(dir)) {
    const file = join(dir, d, 'SKILL.md')
    if (!existsSync(file)) continue
    try {
      const { description } = parseSkill(readFileSync(file, 'utf8'))
      // The folder name is what Claude Code registers; plugin skills are namespaced.
      out.push({ name: prefix + d, description: description ?? '', source })
    } catch {
      /* unreadable */
    }
  }
  return out
}

/** User skills, installed plugins' skills, and the project's own .claude/skills */
export function listSkills(cwd?: string, home = homedir()): SkillInfo[] {
  const out = [...scan(join(home, '.claude', 'skills'), 'user')]
  try {
    const installed = JSON.parse(readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8'))
    for (const [key, entries] of Object.entries<{ installPath?: string }[]>(installed.plugins ?? {})) {
      const path = entries?.[entries.length - 1]?.installPath
      if (path) out.push(...scan(join(path, 'skills'), 'plugin', `${key.split('@')[0]}:`))
    }
  } catch {
    /* no plugins */
  }
  if (cwd) out.unshift(...scan(join(cwd, '.claude', 'skills'), 'project'))
  const seen = new Set<string>()
  return out.filter((s) => !seen.has(s.name) && seen.add(s.name))
}
