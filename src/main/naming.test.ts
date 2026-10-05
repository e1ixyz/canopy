import { describe, expect, it } from 'vitest'
import { cleanSlug, pickPrefix, uniqueBranch } from './naming'

describe('cleanSlug', () => {
  it('keeps a clean kebab slug', () => {
    expect(cleanSlug('fix-password-reset-mobile\n')).toBe('fix-password-reset-mobile')
  })
  it('strips quotes, backticks, a prefix and trailing dots', () => {
    expect(cleanSlug('`feat/add-dark-mode`.')).toBe('add-dark-mode')
    expect(cleanSlug('"Rename Nav Labels"')).toBe('rename-nav-labels')
  })
  it('takes the last line and caps the word count', () => {
    expect(cleanSlug('Sure!\none two three four five six seven')).toBe('one-two-three-four-five')
  })
  it('returns empty when nothing usable came back', () => {
    expect(cleanSlug('   ')).toBe('')
    expect(cleanSlug('!!!')).toBe('')
  })
})

describe('pickPrefix', () => {
  it('prefers the adapter prefix', () => {
    expect(pickPrefix(['feat/a', 'feat/b'], 'wt')).toBe('wt/')
    expect(pickPrefix([], 'fix/')).toBe('fix/')
  })
  it('uses the prefix most recent branches share', () => {
    expect(pickPrefix(['main', 'feat/a', 'fix/b', 'feat/c', 'feat/d'])).toBe('feat/')
  })
  it('falls back to orch/ without a clear convention', () => {
    expect(pickPrefix(['main', 'develop'])).toBe('orch/')
    expect(pickPrefix(['feat/a', 'main'])).toBe('orch/')
    expect(pickPrefix(['orch/a', 'orch/b'])).toBe('orch/')
  })
})

describe('uniqueBranch', () => {
  it('returns the name when it is free', () => {
    expect(uniqueBranch('feat/x', ['main'])).toBe('feat/x')
  })
  it('counts up past local and remote branches', () => {
    expect(uniqueBranch('feat/x', ['feat/x', 'origin/feat/x-2'])).toBe('feat/x-3')
  })
})
