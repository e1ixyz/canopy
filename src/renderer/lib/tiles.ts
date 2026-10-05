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

/** psql on the checkout's DATABASE_URL (or the adapter's db settings), in its own tile */
export async function openDb(cwd: string, projectPath: string) {
  return openDbNow(cwd, projectPath).catch((e) => useApp.getState().toast((e as Error).message, 'error'))
}

async function openDbNow(cwd: string, projectPath: string) {
  const st = useApp.getState()
  const adapter = await orch.invoke('adapter:get', projectPath).catch(() => null)
  const varName = adapter?.db?.varName ?? 'DATABASE_URL'
  const files = await orch.invoke('db:envFiles', cwd, varName)
  const envFile = adapter?.db?.envFile && files.includes(adapter.db.envFile) ? adapter.db.envFile : files.includes('.env') ? '.env' : files[0]
  if (!envFile) return st.toast(`No ${varName} in this checkout's .env files`, 'warn')
  return st.spawn({ kind: 'db', projectPath, cwd, target: { kind: 'db', envFile, varName } })
}

/** Railway logs and variables for this checkout; asks for the project once */
export async function openDeploy(cwd: string, projectPath: string) {
  return openDeployNow(cwd, projectPath).catch((e) => useApp.getState().toast((e as Error).message, 'error'))
}

async function openDeployNow(cwd: string, projectPath: string) {
  const st = useApp.getState()
  const hint = await orch.invoke('deploy:suggest', cwd, projectPath)
  if (!hint.saved) return st.set({ deploySetup: { cwd, projectPath } })
  return st.spawn({ kind: 'deploy', projectPath, cwd, target: { kind: 'deploy', ...hint.saved } })
}
