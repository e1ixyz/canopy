import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { HostEntry } from '@shared/types'

/** Host aliases from an ssh config, first alias per Host line, wildcards skipped */
export function parseSshConfig(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*Host\s+(.+)$/i.exec(raw)
    if (!m) continue
    const first = m[1].split(/\s+/).find((a) => a && !/[*?!]/.test(a))
    if (first && !out.includes(first)) out.push(first)
  }
  return out
}

export function listHosts(appHosts: HostEntry[] = [], configPath = join(homedir(), '.ssh', 'config')): HostEntry[] {
  let fromConfig: string[] = []
  try {
    fromConfig = parseSshConfig(readFileSync(configPath, 'utf8'))
  } catch {
    /* no ssh config */
  }
  const seen = new Set<string>()
  const out: HostEntry[] = []
  for (const name of fromConfig) {
    seen.add(name)
    out.push({ name, source: 'ssh-config' })
  }
  for (const h of appHosts) if (!seen.has(h.name)) out.push({ ...h, source: 'app' })
  return out
}

/** What follows `ssh` for this host */
export const sshTarget = (h: HostEntry) => h.target?.trim() || h.name
