import { Cloud, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { RailwayProject } from '@shared/types'
import { orch } from '../lib/orch'
import { tildify } from '../lib/util'
import { useApp } from '../store/app'
import { Button, Field, inputCls, Modal } from './ui'

/** Pick the Railway project, service and environments for a checkout, once */
export function DeploySetupSheet() {
  const { deploySetup, set } = useApp()
  return (
    <Modal open={!!deploySetup} onClose={() => set({ deploySetup: null })} width={520}>
      {deploySetup && <Body key={deploySetup.cwd + (deploySetup.sessionId ?? '')} setup={deploySetup} />}
    </Modal>
  )
}

// The setup comes in as a prop: the sheet keeps rendering during its exit, after the store clears it.
function Body({ setup }: { setup: { cwd: string; projectPath: string; sessionId?: string } }) {
  const { set, spawn, toast, sessions } = useApp()
  const { cwd, projectPath, sessionId } = setup
  const [projects, setProjects] = useState<RailwayProject[] | null>(null)
  const [error, setError] = useState('')
  const [repo, setRepo] = useState(cwd)
  const [project, setProject] = useState('')
  const [service, setService] = useState('')
  const [envs, setEnvs] = useState<string[]>([])
  const [env, setEnv] = useState('')

  useEffect(() => {
    Promise.all([orch.invoke('deploy:projects'), orch.invoke('deploy:suggest', cwd, projectPath)])
      .then(([list, hint]) => {
        setProjects(list)
        setRepo(hint.repo)
        const cur = sessionId ? sessions[sessionId]?.target : undefined
        const pre = cur?.kind === 'deploy' ? cur : hint.saved ?? hint.linked
        const p = list.find((x) => x.id === pre?.project || x.name === pre?.project) ?? list[0]
        if (!p) return
        setProject(p.id)
        const svc = p.services.find((x) => x === pre?.service) ?? p.services.find((x) => !/postgres|redis|mysql|mongo/i.test(x)) ?? p.services[0] ?? ''
        setService(svc)
        const prefEnvs = cur?.kind === 'deploy' && cur.environments?.length ? cur.environments : p.environments
        setEnvs(prefEnvs)
        setEnv(pre?.environment && p.environments.includes(pre.environment) ? pre.environment : (p.environments.find((e) => e === 'staging') ?? p.environments[0] ?? ''))
      })
      .catch((e) => setError((e as Error).message.split('\n').slice(-3).join(' ')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const p = projects?.find((x) => x.id === project)
  const pickProject = (id: string) => {
    const np = projects?.find((x) => x.id === id)
    setProject(id)
    setService(np?.services.find((x) => !/postgres|redis|mysql|mongo/i.test(x)) ?? np?.services[0] ?? '')
    setEnvs(np?.environments ?? [])
    setEnv(np?.environments.find((e) => e === 'staging') ?? np?.environments[0] ?? '')
  }

  const save = async () => {
    if (!p || !service || !env) return
    const target = { project: p.id, projectName: p.name, service, environment: env, environments: envs.length ? envs : [env] }
    await orch.invoke('deploy:save', repo, target)
    try {
      if (sessionId) await orch.invoke('session:retarget', sessionId, { kind: 'deploy', ...target })
      else await spawn({ kind: 'deploy', projectPath, cwd, target: { kind: 'deploy', ...target } })
      set({ deploySetup: null })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-2.5">
        <Cloud size={16} className="shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-semibold tracking-tight">Railway for this checkout</div>
          <div className="truncate font-mono text-[11.5px] text-white/40">{tildify(repo, orch.homedir)}</div>
        </div>
      </div>
      {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">Couldn't list Railway projects. Is the Railway CLI installed and logged in? {error}</div>}
      {!projects && !error && (
        <div className="flex items-center gap-2 text-[12.5px] text-white/50">
          <Loader2 size={14} className="animate-spin" /> Asking the Railway CLI…
        </div>
      )}
      {projects && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Project">
              <select value={project} onChange={(e) => pickProject(e.target.value)} className={inputCls}>
                {projects.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service">
              <select value={service} onChange={(e) => setService(e.target.value)} className={inputCls}>
                {p?.services.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </Field>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-white/45 uppercase">Environment tabs</div>
            <div className="flex flex-wrap gap-2">
              {p?.environments.map((e) => (
                <label key={e} className="no-drag flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="accent-violet-500"
                    checked={envs.includes(e)}
                    onChange={() => setEnvs((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : p.environments.filter((y) => y === e || cur.includes(y))))}
                  />
                  {e}
                  <input type="radio" name="env-start" className="accent-sky-400" checked={env === e} onChange={() => setEnv(e)} title="Open on this one" />
                </label>
              ))}
            </div>
            <div className="mt-1.5 text-[11.5px] text-white/40">Checked ones become tabs; the radio picks where the tile opens. Nothing here deploys or changes variables.</div>
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <Button onClick={() => set({ deploySetup: null })}>Cancel</Button>
        <Button tone="primary" disabled={!p || !service || !env} onClick={save}>
          {sessionId ? 'Switch' : 'Open logs'}
        </Button>
      </div>
    </div>
  )
}
