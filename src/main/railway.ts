import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { RailwayProject, VarRow } from '@shared/types'
import { readEnvFile } from './dotenv'
import { sh } from './env'

/** Projects with their environments and services, from `railway list --json` */
export async function railwayProjects(): Promise<RailwayProject[]> {
  const raw = JSON.parse(await sh('railway', ['list', '--json'], undefined, 30_000))
  const names = (c?: { edges?: { node: { name: string } }[] }) => (c?.edges ?? []).map((e) => e.node.name)
  return (raw as any[]).map((p) => ({ id: p.id, name: p.name, environments: names(p.environments), services: names(p.services) }))
}

/** What the Railway CLI has linked for one of these directories (it keys links by absolute path) */
export function linkedProject(paths: string[], configPath = join(homedir(), '.railway', 'config.json')) {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
    for (const p of paths) {
      const hit = cfg.projects?.[p]
      if (hit?.project) return { project: hit.project as string, environment: hit.environmentName as string | undefined, service: (hit.service as string | null) ?? undefined }
    }
  } catch {
    /* no railway config */
  }
  return null
}

/** Compare keys only; values never leave the main process unless one is revealed */
export function classifyVars(local: Record<string, string>, remote: Record<string, string | null>): VarRow[] {
  const keys = [...new Set([...Object.keys(local), ...Object.keys(remote)])].sort()
  return keys.map((key) => {
    const inL = key in local
    const inR = key in remote
    const status: VarRow['status'] = !inR ? 'local' : !inL ? 'remote' : remote[key] === null ? 'sealed' : local[key] === remote[key] ? 'same' : 'differs'
    return { key, status }
  })
}

/** Remote values from the last diff, per session, kept in memory for click-to-reveal */
const lastRemote = new Map<string, { remote: Record<string, string | null>; local: Record<string, string> }>()

export async function varsDiff(sessionId: string, t: { project: string; environment: string; service: string }, cwd: string, envFile = '.env') {
  const out = await sh('railway', ['variable', 'list', '-p', t.project, '-e', t.environment, '-s', t.service, '--json'], cwd, 30_000)
  const remote = JSON.parse(out) as Record<string, string | null>
  const local = readEnvFile(join(cwd, envFile))
  lastRemote.set(sessionId, { remote, local })
  return classifyVars(local, remote)
}

export function revealVar(sessionId: string, key: string) {
  const hit = lastRemote.get(sessionId)
  if (!hit) return null
  return { local: hit.local[key], remote: hit.remote[key] ?? undefined }
}

export const forgetVars = (sessionId: string) => lastRemote.delete(sessionId)
