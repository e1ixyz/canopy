import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contextInfo, contextWindow } from './recents'
import { dayKey, ingestLines, messageCost, newFileState, UsageTracker } from './usage'

const line = (id: string, ts: string, u: object, extra: object = {}) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-haiku-4-5', usage: u }, ...extra })

describe('usage ingest', () => {
  it('sums usage once per message id and splits today from all time', () => {
    const st = newFileState()
    const today = dayKey(Date.parse('2026-10-02T15:00:00Z'))
    ingestLines(
      [
        line('m1', '2026-10-01T10:00:00Z', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }),
        line('m2', '2026-10-02T15:00:00Z', { input_tokens: 3, output_tokens: 7 }),
        line('m2', '2026-10-02T15:00:00Z', { input_tokens: 3, output_tokens: 7 }),
        JSON.stringify({ type: 'user', message: { content: 'hi' } }),
        'not json',
      ],
      st,
      today,
    )
    expect(st.all).toMatchObject({ input: 13, output: 12, cacheRead: 100, cacheWrite: 20 })
    expect(st.today).toMatchObject({ input: 3, output: 7, cacheRead: 0, cacheWrite: 0 })
    // haiku 4.5: $1 in, $5 out per MTok
    expect(st.today.cost).toBeCloseTo((3 * 1 + 7 * 5) / 1e6, 12)
    expect(st.model).toBe('claude-haiku-4-5')
  })
  it('resets today when the day rolls over', () => {
    const st = newFileState()
    ingestLines([line('a', new Date().toISOString(), { input_tokens: 5 })], st, dayKey(Date.now()))
    ingestLines([], st, 'some-other-day')
    expect(st.today.input).toBe(0)
    expect(st.all.input).toBe(5)
  })
  it('adds subagent transcripts and earlier transcripts to a session', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'))
    const now = new Date().toISOString()
    const first = join(dir, 'a.jsonl')
    const second = join(dir, 'b.jsonl')
    writeFileSync(first, line('m1', now, { input_tokens: 1, output_tokens: 2 }) + '\n')
    writeFileSync(second, line('m2', now, { input_tokens: 10 }, { message: { id: 'm2', model: 'claude-opus-4-5', usage: { input_tokens: 10 } } }) + '\n')
    mkdirSync(join(dir, 'b', 'subagents'), { recursive: true })
    writeFileSync(join(dir, 'b', 'subagents', 'agent-x.jsonl'), line('s1', now, { output_tokens: 100 }, { isSidechain: true }) + '\n')
    const st = new UsageTracker().readSession([first, second])
    expect(st?.today).toMatchObject({ input: 11, output: 102, cacheRead: 0, cacheWrite: 0 })
    expect(st?.model).toBe('claude-opus-4-5')
  })
  it('counts a transcript reached through a symlinked project dir once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'usage-'))
    mkdirSync(join(dir, 'real'))
    symlinkSync(join(dir, 'real'), join(dir, 'alias'))
    writeFileSync(join(dir, 'real', 's.jsonl'), line('m1', new Date().toISOString(), { input_tokens: 7 }) + '\n')
    const t = new UsageTracker()
    const counted = new Set<string>()
    const a = t.readSession([join(dir, 'real', 's.jsonl'), join(dir, 'alias', 's.jsonl')], counted)
    expect(a?.today.input).toBe(7)
    // a second session pointing at the same file adds nothing
    expect(t.readSession([join(dir, 'alias', 's.jsonl')], counted)).toBeNull()
  })
})

describe('message cost', () => {
  it('prices Opus 5.5 with its 0.05x cache reads and 1-hour writes at 2x', () => {
    const usd = messageCost('claude-opus-5-5', {
      input_tokens: 2,
      output_tokens: 424,
      cache_read_input_tokens: 570_099,
      cache_creation_input_tokens: 17_529,
      cache_creation: { ephemeral_1h_input_tokens: 17_529, ephemeral_5m_input_tokens: 0 },
    })
    expect(usd).toBeCloseTo((2 * 4 + 424 * 20 + 570_099 * 0.2 + 17_529 * 8) / 1e6, 10)
  })
  it('prices 5-minute writes at 1.25x and fast mode at 2x', () => {
    const u = { input_tokens: 1000, output_tokens: 0, cache_creation_input_tokens: 1000 }
    expect(messageCost('claude-sonnet-5-5', u)).toBeCloseTo((1000 * 2 + 1000 * 2.5) / 1e6, 12)
    expect(messageCost('claude-sonnet-5-5', { ...u, speed: 'fast' })).toBeCloseTo((2 * (1000 * 2 + 1000 * 2.5)) / 1e6, 12)
  })
  it('tells model generations apart', () => {
    const u = { input_tokens: 1_000_000 }
    expect(messageCost('claude-opus-4-1-20250805', u)).toBe(15)
    expect(messageCost('claude-opus-4-8', u)).toBe(5)
    expect(messageCost('claude-sonnet-4-6', u)).toBe(3)
    expect(messageCost('claude-fable-5-1', { cache_read_input_tokens: 1_000_000 })).toBe(0.25)
    expect(messageCost('claude-fable-5', { cache_read_input_tokens: 1_000_000 })).toBe(1)
    expect(messageCost('claude-haiku-5-5', { input_tokens: 50_000 })).toBeCloseTo(0.005, 12)
    // over 100K prompt tokens Haiku 5.5 bills 5x
    expect(messageCost('claude-haiku-5-5', { input_tokens: 200_000 })).toBeCloseTo(0.1, 12)
    expect(messageCost('<synthetic>', { input_tokens: 0, output_tokens: 0 })).toBe(0)
  })
})

describe('context window', () => {
  it('is 1M for 4.6 and later, 200K for older models', () => {
    expect(contextWindow('claude-opus-5-5')).toBe(1_000_000)
    expect(contextWindow('claude-opus-4-6')).toBe(1_000_000)
    expect(contextWindow('claude-haiku-5-5')).toBe(1_000_000)
    expect(contextWindow('claude-haiku-4-5-20251001')).toBe(200_000)
    expect(contextWindow('claude-sonnet-4-5')).toBe(200_000)
    expect(contextWindow('claude-sonnet-4-20250514')).toBe(200_000)
    expect(contextWindow('claude-opus-4-1')).toBe(200_000)
    expect(contextWindow('claude-3-7-sonnet-20250219')).toBe(200_000)
    expect(contextWindow('us.anthropic.claude-haiku-4-5')).toBe(200_000)
  })
  it('reads the last turn past a large tail and after a compaction', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ctx-'))
    const f = join(dir, 's.jsonl')
    const turn = line('m1', new Date().toISOString(), { input_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 10_000 }, {
      message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 10_000 } },
    })
    const attachment = JSON.stringify({ type: 'attachment', attachment: { type: 'skill_listing', content: 'x'.repeat(400_000) } })
    writeFileSync(f, [turn, attachment, ''].join('\n'))
    expect(contextInfo(f)).toEqual({ pct: 16, model: 'claude-opus-5-5' })
    const boundary = JSON.stringify({ type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'auto', preTokens: 160_002, postTokens: 40_000 } })
    writeFileSync(f, [turn, boundary, attachment, ''].join('\n'))
    expect(contextInfo(f, 'claude-opus-5-5')?.pct).toBe(4)
  })
  it('honours a [1m] session model and usage past 200K', () => {
    expect(contextWindow('claude-sonnet-4-5', 'sonnet[1m]')).toBe(1_000_000)
    expect(contextWindow('claude-sonnet-4-5', '', 250_000)).toBe(1_000_000)
  })
})
