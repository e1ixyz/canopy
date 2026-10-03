import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import type { TokenTotals } from '@shared/types'

export const zero = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

export const billable = (t: TokenTotals) => t.input + t.output + t.cacheWrite

function add(a: TokenTotals, b: TokenTotals) {
  a.input += b.input
  a.output += b.output
  a.cacheRead += b.cacheRead
  a.cacheWrite += b.cacheWrite
}

export function dayKey(ts: number) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

interface FileState {
  pos: number
  partial: string
  seen: Set<string>
  all: TokenTotals
  today: TokenTotals
  day: string
  model?: string
}

/**
 * Parse complete transcript lines into totals. Claude Code writes one line per
 * content block of an assistant message, each repeating the same usage, so
 * lines are de-duplicated by message id.
 */
export function ingestLines(lines: string[], st: FileState, today: string) {
  if (st.day !== today) {
    st.day = today
    st.today = zero()
  }
  for (const line of lines) {
    if (!line.includes('"usage"')) continue
    let e: any
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    const m = e.message
    const u = m?.usage
    if (!u || e.type !== 'assistant') continue
    const key = m.id ?? e.uuid
    if (key && st.seen.has(key)) continue
    if (key) st.seen.add(key)
    const t: TokenTotals = {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    }
    add(st.all, t)
    const ts = e.timestamp ? Date.parse(e.timestamp) : Date.now()
    if (dayKey(ts) === today) add(st.today, t)
    if (m.model && !e.isSidechain) st.model = m.model
  }
}

export function newFileState(): FileState {
  return { pos: 0, partial: '', seen: new Set(), all: zero(), today: zero(), day: dayKey(Date.now()) }
}

/** Incrementally reads transcripts: each call only parses bytes appended since the last */
export class UsageTracker {
  private files = new Map<string, FileState>()

  read(file: string): FileState | null {
    if (!existsSync(file)) return this.files.get(file) ?? null
    let st = this.files.get(file)
    if (!st) {
      st = newFileState()
      this.files.set(file, st)
    }
    const size = statSync(file).size
    if (size < st.pos) Object.assign(st, newFileState())
    if (size > st.pos) {
      const fd = openSync(file, 'r')
      try {
        const len = size - st.pos
        const buf = Buffer.alloc(len)
        readSync(fd, buf, 0, len, st.pos)
        st.pos = size
        const text = st.partial + buf.toString('utf8')
        const lines = text.split('\n')
        st.partial = lines.pop() ?? ''
        ingestLines(lines, st, dayKey(Date.now()))
      } finally {
        closeSync(fd)
      }
    } else if (st.day !== dayKey(Date.now())) ingestLines([], st, dayKey(Date.now()))
    return st
  }
}

export function sumTotals(list: TokenTotals[]) {
  const t = zero()
  for (const x of list) add(t, x)
  return t
}
