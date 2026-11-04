import { closeSync, existsSync, openSync, readdirSync, readSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { TokenTotals } from '@shared/types'

export const zero = (): TokenTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })

function add(a: TokenTotals, b: TokenTotals) {
  a.input += b.input
  a.output += b.output
  a.cacheRead += b.cacheRead
  a.cacheWrite += b.cacheWrite
  a.cost += b.cost
}

/**
 * API list prices in USD per million tokens: [base input, cache read], first match wins.
 * Every Claude model bills output at 5x input and cache writes at 1.25x (5-minute) or 2x (1-hour);
 * cache reads vary (0.1x on most, 0.05x on Opus 5.5, 0.025x on Fable 5.1), so they get their own column.
 */
const RATES: [RegExp, number, number][] = [
  [/fable-5-1|mythos-5-1/, 10, 0.25],
  [/fable|mythos/, 10, 1],
  [/opus-5-5/, 4, 0.2],
  [/opus-4-[01]|opus-4(?:-\d{8})?$|3-opus/, 15, 1.5],
  [/opus/, 5, 0.5],
  [/sonnet-5/, 2, 0.2],
  [/sonnet/, 3, 0.3],
  [/haiku-5/, 0.1, 0.01],
  [/haiku-4/, 1, 0.1],
  [/haiku/, 0.8, 0.08],
]
/** Unknown ids are priced as the default model */
const FALLBACK: [number, number] = [4, 0.2]

/** USD for one assistant message at API list prices */
export function messageCost(model: string | undefined, u: any): number {
  const id = String(model ?? '').toLowerCase()
  const hit = RATES.find(([re]) => re.test(id))
  let inRate = hit ? hit[1] : FALLBACK[0]
  let readRate = hit ? hit[2] : FALLBACK[1]
  const input = u.input_tokens ?? 0
  const read = u.cache_read_input_tokens ?? 0
  const write = u.cache_creation_input_tokens ?? 0
  const write1h = Math.min(write, u.cache_creation?.ephemeral_1h_input_tokens ?? 0)
  // Haiku 5.5 bills 5x for prompts over 100K tokens
  if (/haiku-5/.test(id) && input + read + write > 100_000) {
    inRate *= 5
    readRate *= 5
  }
  let usd =
    (input * inRate + (u.output_tokens ?? 0) * inRate * 5 + read * readRate + (write - write1h) * inRate * 1.25 + write1h * inRate * 2) / 1e6
  if (u.speed === 'fast') usd *= 2
  return usd + (u.server_tool_use?.web_search_requests ?? 0) * 0.01
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
      cost: messageCost(m.model, u),
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

/** A transcript plus the subagent transcripts Claude Code writes beside it, in <id>/subagents/ */
export function transcriptFamily(file: string): string[] {
  const dir = join(file.replace(/\.jsonl$/, ''), 'subagents')
  try {
    return [file, ...readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f))]
  } catch {
    return [file]
  }
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

  /**
   * Totals over every transcript a session has written, subagents included; the model comes from the newest main transcript.
   * Files already in `counted` are skipped and new ones added, so a transcript reached by two paths (a symlinked
   * project dir, a session resumed under another id) counts once per snapshot.
   */
  readSession(files: string[], counted = new Set<string>()): { today: TokenTotals; all: TokenTotals; model?: string } | null {
    const today = zero()
    const all = zero()
    let model: string | undefined
    let found = false
    for (const main of files) {
      for (const f of transcriptFamily(main)) {
        const key = realPath(f)
        if (counted.has(key)) continue
        counted.add(key)
        const st = this.read(key)
        if (!st) continue
        found = true
        add(today, st.today)
        add(all, st.all)
        if (f === main && st.model) model = st.model
      }
    }
    return found ? { today, all, model } : null
  }
}

function realPath(f: string) {
  try {
    return realpathSync(f)
  } catch {
    return f
  }
}

export function sumTotals(list: TokenTotals[]) {
  const t = zero()
  for (const x of list) add(t, x)
  return t
}
