import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Adapter, DbInfo } from '@shared/types'
import { describeDbUrl, readEnvFile } from './dotenv'

const DB_SCRIPT = /(^|[:_-])(db|seed|migrat|schema|drizzle|prisma)/i
const DANGER = /reset|drop|revert|repair|truncate|wipe|nuke|destroy|push/i

export function packageManager(cwd: string) {
  if (existsSync(join(cwd, 'bun.lock')) || existsSync(join(cwd, 'bun.lockb'))) return 'bun'
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

/** package.json scripts that touch the database, as buttons; destructive-sounding ones ask first */
export function dbScripts(pkg: { scripts?: Record<string, string> }, pm: string) {
  return Object.keys(pkg.scripts ?? {})
    .filter((n) => DB_SCRIPT.test(n))
    .map((name) => ({ name, command: `${pm} run ${name}`, danger: DANGER.test(name) }))
}

/** .env files in the checkout (that define varName, when given) */
export function envFilesWith(cwd: string, varName?: string) {
  try {
    return readdirSync(cwd)
      .filter((f) => /^\.env(\..+)?$/.test(f) && !/\.(example|sample|template)$/.test(f))
      .filter((f) => !varName || !!readEnvFile(join(cwd, f))[varName])
      .sort()
  } catch {
    return []
  }
}

export function dbInfo(cwd: string, target: { envFile: string; varName: string }, adapter: Adapter | null): DbInfo {
  let pkg = {}
  try {
    pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  } catch {
    /* no package.json */
  }
  const url = readEnvFile(join(cwd, target.envFile))[target.varName]
  return {
    envFile: target.envFile,
    varName: target.varName,
    conn: url ? describeDbUrl(url) : null,
    envFiles: envFilesWith(cwd, target.varName),
    scripts: dbScripts(pkg, packageManager(cwd)),
    drift: adapter?.db?.drift,
  }
}
