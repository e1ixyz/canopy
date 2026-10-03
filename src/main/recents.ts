import { existsSync, openSync, readFileSync, readSync, readdirSync, statSync, closeSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { RecentProject, TranscriptSummary } from '@shared/types'

const claudeDir = join(homedir(), '.claude')

/** Recent project dirs, from Claude Code's prompt history (the `project` field) */
export function listRecents(limit = 40): RecentProject[] {
  const byPath = new Map<string, { lastUsed: number; prompts: number }>()
  try {
    const raw = readFileSync(join(claudeDir, 'history.jsonl'), 'utf8')
    for (const line of raw.split('\n')) {
      if (!line) continue
      try {
        const e = JSON.parse(line) as { project?: string; timestamp?: number }
        if (!e.project) continue
        const cur = byPath.get(e.project) ?? { lastUsed: 0, prompts: 0 }
        cur.prompts++
        cur.lastUsed = Math.max(cur.lastUsed, e.timestamp ?? 0)
        byPath.set(e.project, cur)
      } catch {
        /* skip malformed lines */
      }
    }
  } catch {
    /* no history yet */
  }
  const home = homedir()
  return [...byPath.entries()]
    .filter(([p]) => p !== home && !p.startsWith('/private/tmp') && !p.startsWith('/tmp'))
    .map(([path, v]) => {
      const exists = existsSync(path)
      return {
        path,
        name: basename(path),
        lastUsed: v.lastUsed,
        prompts: v.prompts,
        exists,
        isGit: exists && existsSync(join(path, '.git')),
      }
    })
    .filter((r) => r.exists)
    .sort((a, b) => b.lastUsed - a.lastUsed)
    .slice(0, limit)
}

/** Claude Code stores transcripts under ~/.claude/projects/<cwd with / . and space as -> */
export function projectSlug(path: string) {
  return path.replace(/[^a-zA-Z0-9]/g, '-')
}

function readHead(file: string, bytes: number) {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const n = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    closeSync(fd)
  }
}

export function readTail(file: string, bytes: number) {
  const size = statSync(file).size
  const fd = openSync(file, 'r')
  try {
    const len = Math.min(bytes, size)
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content))
    return content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: string }).text) : ''))
      .join(' ')
  return ''
}

/** Past sessions for a project, newest first, for the "resume into a tile" browser */
export function listTranscripts(projectPath: string, limit = 30): TranscriptSummary[] {
  const dir = join(claudeDir, 'projects', projectSlug(projectPath))
  if (!existsSync(dir)) return []
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
  const out: TranscriptSummary[] = []
  for (const { f, mtime } of files) {
    let firstPrompt = ''
    let cwd = projectPath
    try {
      for (const line of readHead(join(dir, f), 64 * 1024).split('\n')) {
        if (!line.includes('"type":"user"')) continue
        try {
          const e = JSON.parse(line)
          if (e.cwd) cwd = e.cwd
          const t = textOf(e.message?.content).trim()
          if (t && !t.startsWith('<')) {
            firstPrompt = t.slice(0, 160)
            break
          }
        } catch {
          /* partial line at the read boundary */
        }
      }
    } catch {
      continue
    }
    out.push({ id: f.replace(/\.jsonl$/, ''), cwd, firstPrompt: firstPrompt || '(no prompt)', mtime })
  }
  return out
}

/** Text of the last assistant message in a transcript (its text blocks joined) */
export function lastAssistantText(transcriptPath: string): { text: string; ts: number } {
  try {
    const lines = readTail(transcriptPath, 512 * 1024).split('\n').reverse()
    let id: string | undefined
    let ts = 0
    const parts: string[] = []
    for (const line of lines) {
      if (!line.includes('"assistant"')) continue
      let e: any
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (e.type !== 'assistant' || e.isSidechain) continue
      const mid = e.message?.id
      if (id && mid !== id) break
      id = mid
      ts = Math.max(ts, e.timestamp ? Date.parse(e.timestamp) : 0)
      for (const c of [...(e.message?.content ?? [])].reverse()) if (c?.type === 'text' && c.text) parts.unshift(c.text)
      if (!mid) break
    }
    return { text: parts.join('\n\n').trim(), ts }
  } catch {
    return { text: '', ts: 0 }
  }
}

/** Context usage (percent) and model from the last assistant turn */
export function contextUsage(transcriptPath: string, model?: string): number | undefined {
  return contextInfo(transcriptPath, model)?.pct
}

export function contextInfo(transcriptPath: string, model?: string): { pct: number; model?: string } | undefined {
  try {
    const tail = readTail(transcriptPath, 256 * 1024).split('\n').reverse()
    for (const line of tail) {
      if (!line.includes('"usage"')) continue
      try {
        const e = JSON.parse(line)
        const u = e.message?.usage
        if (!u || e.isSidechain) continue
        const used =
          (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
        const m = String(model ?? e.message?.model ?? '')
        const window = /\[1m\]|1m/i.test(m) || used > 200_000 ? 1_000_000 : 200_000
        return { pct: Math.min(100, Math.round((used / window) * 100)), model: e.message?.model }
      } catch {
        /* partial line */
      }
    }
  } catch {
    /* transcript not written yet */
  }
  return undefined
}
