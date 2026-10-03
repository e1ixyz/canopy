import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HandoffShelf, slugify, titleOf } from './handoffs'

describe('handoff shelf', () => {
  it('titles and slugs', () => {
    expect(titleOf('# Session handoff — 2026-10-03 — Orchestrator build\n\nbody')).toBe('Orchestrator build')
    expect(titleOf('\n**Goal:** ship it')).toBe('Goal: ship it')
    expect(slugify('Fix the PR body for #42, again!')).toBe('fix-the-pr-body')
    expect(slugify('***')).toBe('handoff')
  })

  it('saves, lists, renames, marks used and removes', () => {
    const shelf = new HandoffShelf(mkdtempSync(join(tmpdir(), 'shelf-')))
    const a = shelf.save({ project: '/p/app', cwd: '/p/app-wt', branch: 'feat/x', session: 'atlas', transcriptId: 't1', created: 1000 }, '# Checkout flow\n\nNext: tests')
    const b = shelf.save({ project: '/p/app', cwd: '/p/app', created: 2000 }, '# Checkout flow\n\nmore')
    expect(a.file.endsWith('1970-01-01-checkout-flow.md')).toBe(true)
    expect(b.file.endsWith('1970-01-01-checkout-flow-2.md')).toBe(true)
    expect(shelf.list('/p/app').map((h) => h.created)).toEqual([2000, 1000])

    const back = shelf.read(a.file)
    expect(back.meta).toMatchObject({ title: 'Checkout flow', cwd: '/p/app-wt', branch: 'feat/x', session: 'atlas', transcriptId: 't1', created: 1000 })
    expect(back.body).toBe('# Checkout flow\n\nNext: tests')

    shelf.markUsed(b.file)
    expect(shelf.list('/p/app').map((h) => h.file)).toEqual([a.file, b.file])
    expect(shelf.counts()).toEqual({ '/p/app': 1 })

    expect(shelf.rename(a.file, 'Renamed').title).toBe('Renamed')
    expect(shelf.read(a.file).body).toBe('# Checkout flow\n\nNext: tests')

    shelf.remove(a.file)
    expect(shelf.list('/p/app')).toHaveLength(1)
    expect(() => shelf.remove('/etc/hosts')).toThrow()
  })

  it('imports an outside file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imp-'))
    const src = join(dir, 'session-handoff-2026-10-03-x.md')
    writeFileSync(src, '# Session handoff — 2026-10-03 — Orchestrator build\n\n**Goal:** more')
    const shelf = new HandoffShelf(join(dir, 'shelf'))
    const h = shelf.importFile(src, '/p/orch')
    expect(h).toMatchObject({ title: 'Orchestrator build', project: '/p/orch', cwd: '/p/orch' })
    expect(shelf.list('/p/orch')).toHaveLength(1)
  })
})
