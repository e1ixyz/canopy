import { describe, expect, it } from 'vitest'
import { parseCommits } from './updater'

describe('parseCommits', () => {
  it('splits sha and subject on the first tab', () => {
    expect(parseCommits('abc1234\tRename to Canopy\ndef5678\tFix: tabs\tin subject\n')).toEqual([
      { sha: 'abc1234', subject: 'Rename to Canopy' },
      { sha: 'def5678', subject: 'Fix: tabs\tin subject' },
    ])
  })

  it('is empty for no output', () => {
    expect(parseCommits('')).toEqual([])
  })
})
