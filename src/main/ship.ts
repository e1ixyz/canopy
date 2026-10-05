import type { Claim, Session, ShipFile } from '@shared/types'
import { matchesClaim } from './bus/glob'
import { shTry } from './env'

/**
 * Paths from `git status --porcelain -z` (renames resolve to the new path). -z keeps paths raw:
 * without it git C-quotes non-ASCII names ("caf\303\251.txt"), which then match nothing.
 */
export function parsePorcelain(out: string): string[] {
  const parts = out.split('\0')
  const files: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    files.push(entry.slice(3))
    // A rename or copy is followed by its original path as the next field.
    if (/[RC]/.test(entry.slice(0, 2))) i++
  }
  return files
}

/**
 * Who each changed file belongs to. Another live session in the same checkout
 * owns a file it edited (and this one did not), or one it has claimed.
 * Everything else is this session's to ship.
 */
export function classify(files: string[], me: Session, others: Session[], claims: Claim[]): ShipFile[] {
  const mine = new Set(me.touched ?? [])
  return files.map((path) => {
    if (mine.has(path)) return { path, owner: 'mine', why: 'touched' }
    const toucher = others.find((o) => o.touched?.includes(path))
    if (toucher) return { path, owner: toucher.id, why: 'touched' }
    const claim = claims.find((c) => c.sessionId !== me.id && c.repo === me.repo && matchesClaim(path, c.pattern))
    if (claim) return { path, owner: claim.sessionId, why: 'claimed' }
    return { path, owner: 'mine', why: 'default' }
  })
}

export async function changedFiles(cwd: string): Promise<{ files: string[]; branch?: string; upstream?: string }> {
  const status = (await shTry('git', ['status', '--porcelain', '-z', '--untracked-files=all'], cwd, 10_000)) ?? ''
  const files = new Set(parsePorcelain(status))
  const upstream = (await shTry('git', ['rev-parse', '--abbrev-ref', '@{u}'], cwd, 5000))?.trim()
  if (upstream) for (const f of ((await shTry('git', ['diff', '--name-only', `${upstream}...HEAD`], cwd, 10_000)) ?? '').split('\n')) if (f) files.add(f)
  const branch = (await shTry('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd, 5000))?.trim()
  return { files: [...files].sort(), branch, upstream }
}
