import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'
import type { HandoffMeta } from '@shared/types'

/**
 * Saved handoffs, one markdown file each, under <root>/<project>/<date>-<slug>.md.
 * A small frontmatter block carries where the work lives so it can be picked up later.
 */
const FIELDS = ['title', 'project', 'cwd', 'branch', 'session', 'transcriptId', 'created', 'used'] as const

export function slugify(text: string, words = 4) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, words)
      .join('-') || 'handoff'
  )
}

/** First markdown heading, else the first non-empty line, without the usual "Session handoff —" noise */
export function titleOf(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const line = lines.find((l) => /^#{1,3}\s/.test(l)) ?? lines[0] ?? 'Handoff'
  return (
    line
      .replace(/^#+\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^(session\s+)?handoff\s*[—:-]\s*(\d{4}-\d{2}-\d{2}\s*[—:-]\s*)?/i, '')
      .trim()
      .slice(0, 90) || 'Handoff'
  )
}

export function projectDir(root: string, projectPath: string) {
  return join(root, slugify(basename(projectPath), 6))
}

export function serialize(meta: Omit<HandoffMeta, 'file'>, body: string) {
  const lines = FIELDS.filter((k) => meta[k] !== undefined && meta[k] !== '').map((k) => {
    const v = meta[k]
    return `${k}: ${k === 'created' || k === 'used' ? new Date(v as number).toISOString() : String(v).replace(/\n/g, ' ')}`
  })
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`
}

export function parse(file: string, raw: string): { meta: HandoffMeta; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw)
  const fm: Record<string, string> = {}
  if (m)
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':')
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  const body = m ? raw.slice(m[0].length).trim() : raw.trim()
  const time = (v?: string) => (v ? Date.parse(v) || undefined : undefined)
  return {
    meta: {
      file,
      title: fm.title || titleOf(body),
      project: fm.project ?? '',
      cwd: fm.cwd ?? fm.project ?? '',
      branch: fm.branch || undefined,
      session: fm.session || undefined,
      transcriptId: fm.transcriptId || undefined,
      created: time(fm.created) ?? 0,
      used: time(fm.used),
    },
    body,
  }
}

export class HandoffShelf {
  constructor(private root: string) {}

  private inside(file: string) {
    const r = resolve(this.root) + sep
    if (!resolve(file).startsWith(r)) throw new Error('Not a saved handoff')
    return file
  }

  /** Unused first (newest first), then used ones */
  list(projectPath?: string): HandoffMeta[] {
    const dirs = projectPath ? [projectDir(this.root, projectPath)] : existsSync(this.root) ? readdirSync(this.root).map((d) => join(this.root, d)) : []
    const out: HandoffMeta[] = []
    for (const d of dirs) {
      if (!existsSync(d)) continue
      for (const f of readdirSync(d)) {
        if (!f.endsWith('.md')) continue
        const file = join(d, f)
        try {
          out.push(parse(file, readFileSync(file, 'utf8')).meta)
        } catch {
          /* unreadable file */
        }
      }
    }
    return out.sort((a, b) => Number(!!a.used) - Number(!!b.used) || b.created - a.created)
  }

  /** Unused handoffs per project path, for the launcher */
  counts(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const h of this.list()) if (!h.used && h.project) out[h.project] = (out[h.project] ?? 0) + 1
    return out
  }

  read(file: string) {
    return parse(file, readFileSync(this.inside(file), 'utf8'))
  }

  save(meta: Omit<HandoffMeta, 'file' | 'title' | 'created'> & { title?: string; created?: number }, body: string): HandoffMeta {
    const created = meta.created ?? Date.now()
    const title = meta.title?.trim() || titleOf(body)
    const dir = projectDir(this.root, meta.project)
    mkdirSync(dir, { recursive: true })
    const stem = `${new Date(created).toISOString().slice(0, 10)}-${slugify(title)}`
    let file = join(dir, `${stem}.md`)
    for (let i = 2; existsSync(file); i++) file = join(dir, `${stem}-${i}.md`)
    const full = { ...meta, title, created }
    writeFileSync(file, serialize(full, body))
    return { ...full, file }
  }

  private update(file: string, patch: Partial<HandoffMeta>) {
    const { meta, body } = this.read(file)
    const next = { ...meta, ...patch }
    const tmp = `${file}.tmp`
    writeFileSync(tmp, serialize(next, body))
    renameSync(tmp, file)
    return next
  }

  rename(file: string, title: string) {
    return this.update(file, { title: title.trim() || undefined })
  }

  markUsed(file: string) {
    return this.update(file, { used: Date.now() })
  }

  remove(file: string) {
    unlinkSync(this.inside(file))
  }

  /** Copy an outside markdown file onto the shelf, keeping its frontmatter if it has ours */
  importFile(path: string, projectPath: string) {
    const { meta, body } = parse(path, readFileSync(path, 'utf8'))
    return this.save(
      { ...meta, project: projectPath, cwd: meta.cwd && existsSync(meta.cwd) ? meta.cwd : projectPath, created: meta.created || Date.now(), used: undefined },
      body,
    )
  }
}
