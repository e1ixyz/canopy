import { describe, expect, it } from 'vitest'
import { allocatePorts, parseClaimedPorts, rewriteEnvPorts, slugify } from './ports'

describe('allocatePorts', () => {
  it('skips reserved pairs even when nothing is listening', () => {
    const r = { '/a': { web: 5174, api: 3001 }, '/b': { web: 5175, api: 3002 } }
    expect(allocatePorts(r, new Set())).toEqual({ web: 5176, api: 3003 })
  })
  it('skips live listeners too', () => {
    expect(allocatePorts({}, new Set([5174, 3001, 3002]))).toEqual({ web: 5175, api: 3003 })
  })
})

describe('rewriteEnvPorts', () => {
  it('rewrites existing keys and keeps everything else', () => {
    const out = rewriteEnvPorts('A=1\nPORT=3000\nexport WEB_PORT=5173\n', { web: 5180, api: 3010 })
    expect(out).toContain('A=1')
    expect(out).toContain('PORT=3010')
    expect(out).toContain('export WEB_PORT=5180')
    expect(out).not.toContain('worktree ports')
  })
  it('appends missing keys', () => {
    const out = rewriteEnvPorts('A=1', { web: 5180, api: 3010 })
    expect(out).toMatch(/PORT=3010/)
    expect(out).toMatch(/WEB_PORT=5180/)
  })
})

describe('parseClaimedPorts', () => {
  it('reads an etwal .wt-run.sh', () => {
    const run = 'cd "/x"\nPORT=3005 WEB_PORT=5174 API_PROXY_TARGET=http://localhost:3005 \\\n  TRUSTED_ORIGINS=http://localhost:5174 bun run dev'
    expect(parseClaimedPorts(run)).toEqual({ api: 3005, web: 5174 })
  })
  it('does not mistake WEB_PORT for PORT', () => {
    expect(parseClaimedPorts('WEB_PORT=5174\n')).toEqual({ web: 5174 })
  })
})

describe('slugify', () => {
  it('flattens branch names', () => expect(slugify('feat/Checkout Flow')).toBe('feat-checkout-flow'))
})
