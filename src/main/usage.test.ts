import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dayKey, ingestLines, newFileState, UsageTracker } from './usage'

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
    expect(st.all).toEqual({ input: 13, output: 12, cacheRead: 100, cacheWrite: 20 })
    expect(st.today).toEqual({ input: 3, output: 7, cacheRead: 0, cacheWrite: 0 })
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
    expect(st?.today).toEqual({ input: 11, output: 102, cacheRead: 0, cacheWrite: 0 })
    expect(st?.model).toBe('claude-opus-4-5')
  })
})
