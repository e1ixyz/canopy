import { describe, expect, it } from 'vitest'
import type { Claim, Session } from '@shared/types'
import { classify, parsePorcelain } from './ship'

const s = (id: string, touched: string[]): Session => ({
  id, name: id, projectId: 'p', kind: 'claude', cwd: '/r', repo: '/r', role: 'plain', status: 'idle', createdAt: 0, started: true, ports: [], unread: 0, touched,
})

describe('ship', () => {
  it('parses porcelain including renames and untracked files', () => {
    expect(parsePorcelain(' M src/a.ts\n?? new.txt\nR  old.ts -> moved.ts\n')).toEqual(['src/a.ts', 'new.txt', 'moved.ts'])
  })
  it('splits files between me, a sibling that edited them, and a claim holder', () => {
    const me = s('me', ['src/a.ts'])
    const other = s('bo', ['src/b.ts', 'src/a.ts'])
    const claims: Claim[] = [{ id: 'c', sessionId: 'cy', repo: '/r', pattern: 'src/api/**', reason: '', ts: 0 }]
    const out = classify(['src/a.ts', 'src/b.ts', 'src/api/x.ts', 'README.md'], me, [other], claims)
    expect(out).toEqual([
      { path: 'src/a.ts', owner: 'mine', why: 'touched' },
      { path: 'src/b.ts', owner: 'bo', why: 'touched' },
      { path: 'src/api/x.ts', owner: 'cy', why: 'claimed' },
      { path: 'README.md', owner: 'mine', why: 'default' },
    ])
  })
})
