import { describe, expect, it } from 'vitest'
import { LIMIT, plainText, TRUST } from './termtext'

describe('plainText', () => {
  it('turns cursor-forward moves back into spaces', () => {
    const raw = '\x1b[1mYes,\x1b[1CI\x1b[1Ctrust\x1b[1Cthis\x1b[1Cfolder\x1b[22m'
    expect(plainText(raw)).toBe('Yes, I trust this folder')
    expect(TRUST.test(plainText(raw))).toBe(true)
  })
  it('reads column moves as word gaps (how Claude Code draws its trust dialog)', () => {
    const raw = '\x1b[4GYes,\x1b[9GI\x1b[11Gtrust\x1b[17Gthis\x1b[22Gfolder\r\n'
    expect(TRUST.test(plainText(raw))).toBe(true)
  })
  it('expands counted moves and drops other escapes', () => {
    expect(plainText('a\x1b[3Cb\x1b]11;?\x07')).toBe('a   b')
  })
  it('ignores ordinary talk about rate limits', () => {
    expect(LIMIT.test('Added rate limit middleware to the API')).toBe(false)
    expect(LIMIT.test('5-hour limit reached ∙ resets 3pm')).toBe(true)
  })
  it('caps huge cursor moves', () => {
    expect(plainText('a\x1b[600000000Cb').length).toBeLessThan(300)
  })
  it('lets the limit pattern see spaced words', () => {
    expect(LIMIT.test(plainText('Claude\x1b[1Cusage\x1b[1Climit\x1b[1Creached'))).toBe(true)
  })
})
