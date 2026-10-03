import { nanoid } from 'nanoid'
import type { BusKind, BusMessage, Claim, Session } from '@shared/types'
import { matchesClaim } from './glob'

export interface BusStore {
  messages: BusMessage[]
  claims: Claim[]
  sessions: () => Session[]
  onMessage: (m: BusMessage) => void
  onClaims: (c: Claim[]) => void
  persist: () => void
}

/** Resolve a `to` field: a session id, a session name, `project` (same repo), `*` or `user` */
export function recipients(to: string, from: Session | undefined, sessions: Session[]): string[] {
  const live = sessions.filter((s) => s.kind === 'claude' && s.id !== from?.id)
  if (to === '*' || to === 'all') return live.map((s) => s.id)
  if (to === 'project') return live.filter((s) => s.projectId === from?.projectId).map((s) => s.id)
  if (to === 'user') return ['user']
  const byId = sessions.find((s) => s.id === to)
  if (byId) return [byId.id]
  const lower = to.toLowerCase().replace(/^@/, '')
  const byName = sessions.filter((s) => s.name.toLowerCase() === lower)
  return byName.map((s) => s.id)
}

export function isFor(m: BusMessage, sessionId: string, sessions: Session[]): boolean {
  if (m.from === sessionId) return false
  if (m.kind !== 'message' && m.kind !== 'broadcast' && m.kind !== 'handoff') return false
  const from = sessions.find((s) => s.id === m.from)
  const target = sessions.find((s) => s.id === sessionId)
  if (m.to === '*' || m.to === 'all') return true
  if (m.to === 'project') return !!from && !!target && from.projectId === target.projectId
  return m.to === sessionId
}

export class Bus {
  constructor(private store: BusStore) {}

  post(kind: BusKind, from: string, to: string, body: string, wake = false): BusMessage {
    const m: BusMessage = { id: nanoid(10), kind, from, to, body, ts: Date.now(), readBy: [], wake }
    this.store.messages.push(m)
    if (this.store.messages.length > 1000) this.store.messages.splice(0, this.store.messages.length - 1000)
    this.store.onMessage(m)
    this.store.persist()
    return m
  }

  unread(sessionId: string): BusMessage[] {
    const sessions = this.store.sessions()
    return this.store.messages.filter((m) => isFor(m, sessionId, sessions) && !m.readBy.includes(sessionId))
  }

  markRead(sessionId: string, ids?: string[]) {
    for (const m of this.unread(sessionId)) if (!ids || ids.includes(m.id)) m.readBy.push(sessionId)
    this.store.persist()
  }

  /** Inbox formatted for injection into a session's context */
  formatInbox(sessionId: string, msgs = this.unread(sessionId)): string {
    const sessions = this.store.sessions()
    const name = (id: string) => (id === 'user' ? 'the user (GUI)' : (sessions.find((s) => s.id === id)?.name ?? id))
    const lines = msgs.map((m) => {
      const when = new Date(m.ts).toLocaleTimeString()
      const scope = m.to === sessionId ? '' : ` (to ${m.to})`
      const label = m.kind === 'handoff' ? 'HANDOFF' : 'message'
      return `- [${when}] ${label} from ${name(m.from)} [${m.from}]${scope}:\n${m.body.replace(/^/gm, '  ')}`
    })
    return `<orchestrator-inbox>\n${lines.join('\n')}\n</orchestrator-inbox>`
  }

  claim(session: Session, patterns: string[], reason: string): { claimed: string[]; conflicts: Claim[] } {
    const repo = session.repo ?? session.cwd
    const conflicts: Claim[] = []
    const claimed: string[] = []
    for (const raw of patterns) {
      const pattern = raw.replace(/^\.\//, '')
      const clash = this.store.claims.filter(
        (c) => c.repo === repo && c.sessionId !== session.id && (matchesClaim(pattern, c.pattern) || matchesClaim(c.pattern, pattern)),
      )
      if (clash.length) {
        conflicts.push(...clash)
        continue
      }
      if (!this.store.claims.some((c) => c.sessionId === session.id && c.pattern === pattern)) {
        this.store.claims.push({ id: nanoid(8), sessionId: session.id, repo, pattern, reason, ts: Date.now() })
      }
      claimed.push(pattern)
    }
    if (claimed.length) this.post('claim', session.id, 'project', `claimed ${claimed.join(', ')}${reason ? ` — ${reason}` : ''}`)
    this.store.onClaims(this.store.claims)
    this.store.persist()
    return { claimed, conflicts }
  }

  release(sessionId: string, patterns?: string[]) {
    const before = this.store.claims.length
    const released: string[] = []
    for (let i = this.store.claims.length - 1; i >= 0; i--) {
      const c = this.store.claims[i]
      if (c.sessionId === sessionId && (!patterns || patterns.includes(c.pattern))) {
        released.push(c.pattern)
        this.store.claims.splice(i, 1)
      }
    }
    if (before !== this.store.claims.length) {
      this.post('release', sessionId, 'project', `released ${released.join(', ')}`)
      this.store.onClaims(this.store.claims)
      this.store.persist()
    }
    return released
  }

  releaseById(id: string) {
    const c = this.store.claims.find((x) => x.id === id)
    if (c) this.release(c.sessionId, [c.pattern])
  }

  owners(repo: string, relPath: string, except?: string): Claim[] {
    return this.store.claims.filter((c) => c.repo === repo && c.sessionId !== except && matchesClaim(relPath, c.pattern))
  }
}
