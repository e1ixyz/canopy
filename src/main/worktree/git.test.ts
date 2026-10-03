import { describe, expect, it } from 'vitest'
import { parseStatusV2, parseWorktreeList } from './git'

describe('parseWorktreeList', () => {
  it('parses porcelain output, first entry is primary', () => {
    const out = `worktree /r/etwal\nHEAD 0123456789abcdef\nbranch refs/heads/develop\n\nworktree /r/etwal-wt-feat/x\nHEAD fedcba9876543210\nbranch refs/heads/feat/x\n\nworktree /r/det\nHEAD aaaaaaaaaaaaaaa\ndetached\n`
    const w = parseWorktreeList(out)
    expect(w).toHaveLength(3)
    expect(w[0]).toMatchObject({ path: '/r/etwal', branch: 'develop', isPrimary: true, head: '0123456' })
    expect(w[1]).toMatchObject({ branch: 'feat/x', isPrimary: false })
    expect(w[2].branch).toBe('(detached)')
  })
})

describe('parseStatusV2', () => {
  it('reads branch, ahead/behind and dirty count', () => {
    const out = '# branch.oid abc\n# branch.head feat/x\n# branch.upstream origin/feat/x\n# branch.ab +2 -5\n1 .M N... 100644 100644 100644 a b src/a.ts\n? new.txt\n'
    expect(parseStatusV2(out)).toEqual({ branch: 'feat/x', ahead: 2, behind: 5, dirty: 2, upstream: 'origin/feat/x' })
  })
})
