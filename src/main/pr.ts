import type { PrCheck, PrInfo } from '@shared/types'
import { shTry } from './env'

const FIELDS = 'number,title,url,state,isDraft,body,reviewDecision,statusCheckRollup,comments,reviews,headRefName,baseRefName'
const cache = new Map<string, { at: number; pr: PrInfo | null }>()

export function checkState(c: { status?: string; conclusion?: string; state?: string }): PrCheck['state'] {
  const v = String(c.conclusion || c.state || c.status || '').toUpperCase()
  if (['SUCCESS', 'NEUTRAL'].includes(v)) return 'pass'
  if (['SKIPPED', 'CANCELLED', 'STALE'].includes(v)) return 'skipped'
  if (['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(v)) return 'fail'
  return 'pending'
}

export function parsePr(json: string): PrInfo {
  const r = JSON.parse(json)
  return {
    number: r.number,
    title: r.title,
    url: r.url,
    state: r.state,
    isDraft: !!r.isDraft,
    body: r.body ?? '',
    reviewDecision: r.reviewDecision || undefined,
    checks: (r.statusCheckRollup ?? []).map((c: any) => ({ name: c.name || c.context || 'check', state: checkState(c) })),
    comments: (r.comments ?? []).slice(-6).map((c: any) => ({ author: c.author?.login ?? '?', body: c.body ?? '', at: c.createdAt ?? '' })),
    reviews: (r.reviews ?? []).slice(-6).map((c: any) => ({ author: c.author?.login ?? '?', state: c.state ?? '', body: c.body ?? '' })),
    head: r.headRefName,
    base: r.baseRefName,
  }
}

/** The PR for the branch checked out in `cwd`, or null when there is none */
export async function getPr(cwd: string, force = false): Promise<PrInfo | null> {
  const hit = cache.get(cwd)
  if (!force && hit && Date.now() - hit.at < 30_000) return hit.pr
  const out = await shTry('gh', ['pr', 'view', '--json', FIELDS], cwd, 20_000)
  let pr: PrInfo | null = null
  if (out) {
    try {
      pr = parsePr(out)
    } catch {
      pr = null
    }
  }
  cache.set(cwd, { at: Date.now(), pr })
  return pr
}
