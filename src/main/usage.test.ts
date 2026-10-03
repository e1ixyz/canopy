import { describe, expect, it } from 'vitest'
import { dayKey, ingestLines, newFileState } from './usage'

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
})
