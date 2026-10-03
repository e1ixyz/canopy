import { describe, expect, it } from 'vitest'
import { attribute, parseLsofCwd, parseLsofListen, parsePs } from './port-watcher'

describe('lsof parsing', () => {
  it('reads listeners and dedupes v4/v6', () => {
    const out = 'p100\nf20\nn*:5173\nf21\nn[::1]:5173\np200\nf9\nn127.0.0.1:3001\n'
    expect(parseLsofListen(out)).toEqual([
      { pid: 100, port: 5173 },
      { pid: 200, port: 3001 },
    ])
  })
  it('keeps the command name', () => {
    expect(parseLsofListen('p100\ncnode\nf20\nn*:5173\np200\ncpostgres\nn127.0.0.1:5432\n')).toEqual([
      { pid: 100, port: 5173, command: 'node' },
      { pid: 200, port: 5432, command: 'postgres' },
    ])
  })
  it('reads cwd', () => {
    expect(parseLsofCwd('p100\nfcwd\nn/a/b\np200\nfcwd\nn/c\n')).toEqual(new Map([[100, '/a/b'], [200, '/c']]))
  })
})

describe('attribute', () => {
  const parent = parsePs('  1 0\n 10 1\n 11 10\n 12 11\n 20 1\n 30 1\n')
  const procs = [
    { id: 'claudeA', pid: 10, cwd: '/r/etwal' },
    { id: 'claudeB', pid: 20, cwd: '/r/etwal-wt-x' },
  ]
  it('assigns by process tree first', () => {
    const r = attribute([{ pid: 12, port: 5173, cwd: '/r/etwal-wt-x' }], procs, parent, new Set())
    expect(r.get('claudeA')).toEqual([5173])
    expect(r.get('claudeB')).toEqual([])
  })
  it('falls back to the deepest matching cwd, never by port alone', () => {
    const r = attribute([{ pid: 30, port: 5174, cwd: '/r/etwal-wt-x/packages/web' }], procs, parent, new Set())
    expect(r.get('claudeB')).toEqual([5174])
    expect(r.get('claudeA')).toEqual([])
  })
  it('ignores the harness own port', () => {
    const r = attribute([{ pid: 12, port: 47821 }], procs, parent, new Set([47821]))
    expect(r.get('claudeA')).toEqual([])
  })
})
