import { motion } from 'motion/react'
import { AlertTriangle, Cloud, Database, Eye, EyeOff, KeyRound, Loader2, Play, RefreshCw, Settings2, TerminalSquare } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { DbInfo, Session, VarRow } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { cx } from '../lib/util'
import { useApp } from '../store/app'
import { Button, inputCls, Segmented } from './ui'

const panelCls = 'flex w-[min(340px,48%)] shrink-0 flex-col border-l border-white/[0.06] bg-[#0d0d15]/80'
const label = 'text-[10.5px] font-semibold tracking-[0.12em] text-white/35 uppercase'

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={spring.layout}
      onMouseDown={(e) => e.stopPropagation()}
      className={panelCls}
    >
      {children}
    </motion.div>
  )
}

/** Beside a psql terminal: which database, which .env, and the repo's db scripts as buttons */
export function DbPanel({ s, projectPath }: { s: Session; projectPath: string }) {
  const [info, setInfo] = useState<DbInfo | null>(null)
  const [armed, setArmed] = useState<string | null>(null)
  const { toast, addTile } = useApp()
  const target = s.target?.kind === 'db' ? s.target : null

  useEffect(() => {
    orch.invoke('db:info', s.id).then(setInfo).catch((e) => toast((e as Error).message, 'error'))
  }, [s.id, target?.envFile, target?.varName, toast])

  const run = async (name: string, command: string) => {
    const sess = await orch.invoke('shell:run', s.cwd, projectPath, command, name)
    addTile(sess.id)
    setArmed(null)
  }

  if (!target) return null
  return (
    <Panel>
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <Database size={15} className="text-emerald-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white/90">{info?.conn ? info.conn.database : 'Database'}</div>
          <div className="truncate font-mono text-[10.5px] text-white/40">
            {info?.conn ? `${info.conn.user ? `${info.conn.user}@` : ''}${info.conn.host}:${info.conn.port}` : info ? `No ${target.varName} in ${target.envFile}` : '…'}
          </div>
        </div>
        <button type="button" title="Reconnect" onClick={() => orch.invoke('session:restart', s.id)} className="no-drag rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white">
          <RefreshCw size={13} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {info && info.envFiles.length > 1 && (
          <div className="space-y-1.5">
            <div className={label}>Connection from</div>
            <Segmented
              id={`db-env-${s.id}`}
              value={target.envFile}
              onChange={(envFile) => orch.invoke('session:retarget', s.id, { ...target, envFile })}
              options={info.envFiles.map((f) => ({ value: f, label: f }))}
            />
          </div>
        )}
        <div className="space-y-1.5">
          <div className={label}>Scripts</div>
          {!info?.scripts.length && <div className="text-[12px] text-white/40">No db, seed or migrate scripts in package.json.</div>}
          {info?.scripts.map((sc) => (
            <button
              key={sc.name}
              type="button"
              onClick={() => (sc.danger && armed !== sc.name ? setArmed(sc.name) : run(sc.name, sc.command))}
              onMouseLeave={() => armed === sc.name && setArmed(null)}
              className={cx(
                'no-drag flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left font-mono text-[11.5px] transition',
                armed === sc.name
                  ? 'border-rose-400/50 bg-rose-500/15 text-rose-100'
                  : sc.danger
                    ? 'border-white/[0.06] bg-white/[0.02] text-amber-100/80 hover:bg-white/[0.05]'
                    : 'border-white/[0.06] bg-white/[0.02] text-white/80 hover:bg-white/[0.06]',
              )}
            >
              {sc.danger ? <AlertTriangle size={12} className="shrink-0" /> : <Play size={11} className="shrink-0 text-white/40" />}
              <span className="flex-1 truncate">{armed === sc.name ? `Run ${sc.name}? Click again` : sc.name}</span>
            </button>
          ))}
        </div>
        {info?.drift && (
          <Button size="sm" tone="soft" onClick={() => run('drift', info.drift!)}>
            Check migration drift
          </Button>
        )}
        <div className="text-[11px] leading-relaxed text-white/30">The URL is read from {target.envFile} when the tile starts and passed to psql through its environment, never on the command line.</div>
      </div>
    </Panel>
  )
}

const VAR_STYLE: Record<VarRow['status'], { text: string; cls: string }> = {
  same: { text: 'same', cls: 'text-white/30' },
  differs: { text: 'differs', cls: 'bg-amber-400/15 text-amber-200' },
  local: { text: 'local only', cls: 'bg-sky-400/15 text-sky-200' },
  remote: { text: 'remote only', cls: 'bg-violet-400/15 text-violet-200' },
  sealed: { text: 'sealed', cls: 'text-white/30' },
}

/** Beside `railway logs`: environment tabs, the variables diff against a local .env, and ssh */
export function DeployPanel({ s }: { s: Session }) {
  const target = s.target?.kind === 'deploy' ? s.target : null
  const { toast, addTile, set } = useApp()
  const [envFiles, setEnvFiles] = useState<string[]>([])
  const [envFile, setEnvFile] = useState('.env')
  const [rows, setRows] = useState<VarRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'diff' | 'all'>('diff')
  const [shown, setShown] = useState<Record<string, { local?: string; remote?: string }>>({})

  useEffect(() => {
    orch.invoke('db:envFiles', s.cwd).then((f) => {
      setEnvFiles(f)
      if (f.length && !f.includes('.env')) setEnvFile(f[0])
    })
  }, [s.cwd])
  useEffect(() => {
    setRows(null)
    setShown({})
  }, [target?.environment, target?.service])

  const compare = async () => {
    setLoading(true)
    setShown({})
    try {
      setRows(await orch.invoke('deploy:vars', s.id, envFile))
    } catch (e) {
      toast(`railway: ${(e as Error).message.split('\n').slice(-2).join(' ')}`, 'error')
    } finally {
      setLoading(false)
    }
  }
  const reveal = async (key: string) => {
    if (shown[key]) return setShown(({ [key]: _, ...rest }) => rest)
    const v = await orch.invoke('deploy:reveal', s.id, key)
    if (v) setShown((cur) => ({ ...cur, [key]: v }))
  }

  if (!target) return null
  const envs = target.environments?.length ? target.environments : [target.environment]
  const list = (rows ?? []).filter((r) => filter === 'all' || (r.status !== 'same' && r.status !== 'sealed'))
  const counts = rows ? { differs: rows.filter((r) => r.status === 'differs').length, local: rows.filter((r) => r.status === 'local').length, remote: rows.filter((r) => r.status === 'remote').length } : null

  return (
    <Panel>
      <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4 py-3">
        <Cloud size={15} className="text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white/90">{target.service}</div>
          <div className="truncate font-mono text-[10.5px] text-white/40">{target.projectName ?? target.project}</div>
        </div>
        <button
          type="button"
          title="Change project or service"
          onClick={() => set({ deploySetup: { cwd: s.cwd, projectPath: s.repo ?? s.cwd, sessionId: s.id } })}
          className="no-drag rounded-md p-1.5 text-white/45 hover:bg-white/10 hover:text-white"
        >
          <Settings2 size={13} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {envs.length > 1 && (
          <Segmented id={`deploy-env-${s.id}`} value={target.environment} onChange={(environment) => orch.invoke('session:retarget', s.id, { ...target, environment })} options={envs.map((e) => ({ value: e, label: e }))} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" tone="soft" onClick={() => orch.invoke('session:restart', s.id)}>
            <RefreshCw size={12} /> Restart logs
          </Button>
          <Button
            size="sm"
            tone="soft"
            onClick={() =>
              orch
                .invoke('deploy:ssh', s.id)
                .then((x) => addTile(x.id))
                .catch((e) => toast((e as Error).message, 'error'))
            }
          >
            <TerminalSquare size={12} /> SSH
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className={cx(label, 'flex-1')}>Variables vs local</div>
            {rows && <Segmented id={`vars-filter-${s.id}`} value={filter} onChange={setFilter} options={[{ value: 'diff', label: 'Diff' }, { value: 'all', label: 'All' }]} />}
          </div>
          <div className="flex gap-2">
            <select value={envFile} onChange={(e) => (setEnvFile(e.target.value), setRows(null))} className={cx(inputCls, 'py-1.5 font-mono text-[11.5px]')}>
              {(envFiles.length ? envFiles : ['.env']).map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
            <Button size="sm" tone="primary" onClick={compare} disabled={loading}>
              {loading ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />} {rows ? 'Refresh' : 'Compare'}
            </Button>
          </div>
          {counts && (
            <div className="text-[11.5px] text-white/45">
              {rows!.length} keys · {counts.differs} differ · {counts.local} only local · {counts.remote} only on {target.environment}
            </div>
          )}
          {rows && !list.length && <div className="py-3 text-center text-[12px] text-emerald-200/70">In parity.</div>}
          <div className="space-y-0.5">
            {list.map((r) => (
              <div key={r.key} className="rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-white/80">{r.key}</span>
                  <span className={cx('rounded-md px-1.5 py-0.5 text-[10px]', VAR_STYLE[r.status].cls)}>{VAR_STYLE[r.status].text}</span>
                  {r.status !== 'sealed' && (
                    <button type="button" title={shown[r.key] ? 'Hide values' : 'Reveal values'} onClick={() => reveal(r.key)} className="no-drag rounded p-0.5 text-white/35 hover:text-white">
                      {shown[r.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  )}
                </div>
                {shown[r.key] && (
                  <div className="mt-1 space-y-0.5 font-mono text-[10.5px] break-all">
                    <div className="text-sky-200/70">local: {shown[r.key].local ?? '—'}</div>
                    <div className="text-violet-200/70">
                      {target.environment}: {shown[r.key].remote ?? '—'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="text-[11px] leading-relaxed text-white/30">Read-only. Values stay hidden until you reveal one, and nothing is saved.</div>
        </div>
      </div>
    </Panel>
  )
}
