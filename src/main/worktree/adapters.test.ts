import { describe, expect, it } from 'vitest'
import { fill, matchAdapter } from './adapters'

describe('matchAdapter', () => {
  const a = [
    { name: 'tree', match: '/x/Etwal/' },
    { name: 'deep', match: '/x/Etwal/etwal-wt-feat/' },
  ]
  it('picks the most specific prefix', () => {
    expect(matchAdapter('/x/Etwal/etwal', a)?.name).toBe('tree')
    expect(matchAdapter('/x/Etwal/etwal-wt-feat/foo', a)?.name).toBe('deep')
    expect(matchAdapter('/y', a)).toBeNull()
  })
})

describe('fill', () => {
  it('substitutes and quotes unsafe values', () => {
    expect(fill('"{primary}/s.sh" {branch} {base}', { primary: '/a b', branch: 'feat/x', base: 'origin/develop' })).toBe(
      `"/a b/s.sh" feat/x origin/develop`,
    )
    expect(fill('{primary}/s.sh', { primary: '/a b' })).toBe(`'/a b'/s.sh`)
    expect(fill('"{p}"', { p: 'a"$b' })).toBe('"a\\"\\$b"')
    expect(fill('{unknown} x', {})).toBe('{unknown} x')
    expect(fill('{branch}', { branch: "it's" })).toBe(`'it'\\''s'`)
  })
})
