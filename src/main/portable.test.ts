import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..', '..')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

describe('portability', () => {
  it('ships no absolute home paths', () => {
    const bad = ['src', 'examples']
      .flatMap((d) => files(join(root, d)))
      .filter((f) => !f.endsWith('portable.test.ts') && /\/Users\/\w/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
