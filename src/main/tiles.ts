import type { Session, TileTarget } from '@shared/types'

/** Single-quote for a POSIX shell unless the value is plainly safe */
export const q = (s: string) => (/^[\w./:@%+=,-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`)

/** Kinds that run a command in a PTY that the app derives from the tile's target */
export const TARGET_KINDS = new Set<Session['kind']>(['deploy', 'db', 'host'])

/**
 * The shell command for a deploy, db or host tile. Secrets never go on the command
 * line: the db URL travels in the PTY environment as ORCH_DB_URL.
 */
export function commandFor(target: TileTarget, secrets: { dbUrl?: string } = {}): { command: string; env: Record<string, string> } {
  switch (target.kind) {
    case 'host':
      // `target.host` is what follows `ssh` (an alias, or user@host plus flags the user typed)
      return { command: target.claude ? `ssh -t ${target.host} 'exec $SHELL -lc claude'` : `ssh ${target.host}`, env: {} }
    case 'db':
      if (!secrets.dbUrl) return { command: `echo ${q(`No ${target.varName} in ${target.envFile}`)}; exec $SHELL -l`, env: {} }
      return { command: 'psql "$ORCH_DB_URL"', env: { ORCH_DB_URL: secrets.dbUrl } }
    case 'deploy':
      return { command: `railway logs -p ${q(target.project)} -e ${q(target.environment)} -s ${q(target.service)}`, env: {} }
    case 'design':
      return { command: '', env: {} }
  }
}

/** Default tile name per kind */
export function baseName(target?: TileTarget, branch?: string) {
  switch (target?.kind) {
    case 'host':
      return target.host.split(/\s+/)[0].replace(/^.*@/, '')
    case 'db':
      return `db:${branch ?? 'local'}`
    case 'deploy':
      return `railway:${target.environment}`
    case 'design':
      return 'design'
    default:
      return 'tile'
  }
}
