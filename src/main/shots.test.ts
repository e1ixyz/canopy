import { describe, expect, it } from 'vitest'
import { resolveRoute, shotFileName } from './shots'

describe('shot sets', () => {
  it('numbers and slugs files', () => {
    expect(shotFileName(0, '/ta/navigate?x=1', 1440)).toBe('01-ta-navigate-1440.png')
    expect(shotFileName(9, '/', 390)).toBe('10-home-390.png')
    expect(shotFileName(1, 'http://localhost:5174/dmc/Trips/', 1440)).toBe('02-dmc-trips-1440.png')
  })
  it('resolves routes against the preview origin', () => {
    expect(resolveRoute('http://localhost:5174', 'ta/trips')).toBe('http://localhost:5174/ta/trips')
    expect(resolveRoute('http://localhost:5174', 'https://x.dev/a')).toBe('https://x.dev/a')
  })
})
