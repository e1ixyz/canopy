import type { HostEntry } from '@shared/types'
import { useApp } from '../store/app'
import { orch } from './orch'
import { submitPrompt } from './terms'

export const sshTarget = (h: HostEntry) => h.target?.trim() || h.name

/** A shell (or Claude) on a saved host, in its own tile */
export function openHost(h: HostEntry, claude = false) {
  return useApp.getState().spawn({
    kind: 'host',
    projectPath: '',
    cwd: orch.homedir,
    name: claude ? `${h.name}:claude` : undefined,
    target: { kind: 'host', host: sshTarget(h), claude },
  })
}

/** Run a skill in the active Claude tile, or in a scratch session when there isn't one */
export async function runSkill(name: string, sessionId?: string) {
  const st = useApp.getState()
  const s = sessionId ? st.sessions[sessionId] : undefined
  if (s?.kind === 'claude' && s.status !== 'exited' && s.status !== 'error') return submitPrompt(s.id, `/${name}`)
  await st.spawn({ kind: 'claude', projectPath: '', cwd: orch.homedir, prompt: `/${name}` })
}
