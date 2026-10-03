import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Per-user files the app owns: adapters, saved handoffs. ORCH_HOME moves it (test instances). */
export function orchHome(...parts: string[]) {
  const root = process.env.ORCH_HOME || join(homedir(), '.orchestrator')
  return join(root, ...parts)
}

export function ensureDir(d: string) {
  mkdirSync(d, { recursive: true })
  return d
}
