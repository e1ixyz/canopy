import { describe, expect, it } from 'vitest'
import type { BusMessage, Claim, Session } from '@shared/types'
import { Bus, recipients } from './bus'
import { matchesClaim } from './glob'

const mk = (id: string, name: string, projectId = 'p'): Session => ({
  id, name, projectId, kind: 'claude', cwd: `/r/${name}`, repo: '/r/main', role: 'plain', status: 'idle',
  createdAt: 0, started: true, ports: [], unread: 0,
})

function setup() {
  const sessions = [mk('a', 'atlas'), mk('b', 'birch'), mk('c', 'cedar', 'q')]
  const messages: BusMessage[] = []
  const claims: Claim[] = []
  const bus = new Bus({ messages, claims, sessions: () => sessions, onMessage: () => {}, onClaims: () => {}, persist: () => {} })
  return { bus, sessions, messages, claims }
}

describe('recipients', () => {
  const { sessions } = setup()
  it('resolves names, ids and scopes', () => {
    expect(recipients('birch', sessions[0], sessions)).toEqual(['b'])
    expect(recipients('@Birch', sessions[0], sessions)).toEqual(['b'])
    expect(recipients('project', sessions[0], sessions)).toEqual(['b'])
    expect(recipients('*', sessions[0], sessions).sort()).toEqual(['b', 'c'])
    expect(recipients('nobody', sessions[0], sessions)).toEqual([])
  })
})

describe('inbox', () => {
  it('delivers direct and project broadcasts, marks read', () => {
    const { bus } = setup()
    bus.post('message', 'a', 'b', 'hi')
    bus.post('broadcast', 'a', 'project', 'all hands')
    expect(bus.unread('b')).toHaveLength(2)
    expect(bus.unread('c')).toHaveLength(0)
    expect(bus.unread('a')).toHaveLength(0)
    bus.markRead('b')
    expect(bus.unread('b')).toHaveLength(0)
  })
  it('does not deliver claim notices as inbox items', () => {
    const { bus, sessions } = setup()
    bus.claim(sessions[0], ['src/**'], 'refactor')
    expect(bus.unread('b')).toHaveLength(0)
  })
})

describe('claims', () => {
  it('blocks overlapping claims in the same repo, across worktrees', () => {
    const { bus, sessions } = setup()
    expect(bus.claim(sessions[0], ['src/api/**'], 'x').claimed).toEqual(['src/api/**'])
    const r = bus.claim(sessions[1], ['src/api/users.ts'], 'y')
    expect(r.claimed).toEqual([])
    expect(r.conflicts[0].sessionId).toBe('a')
    expect(bus.owners('/r/main', 'src/api/users.ts', 'b')).toHaveLength(1)
    bus.release('a')
    expect(bus.owners('/r/main', 'src/api/users.ts', 'b')).toHaveLength(0)
  })
})

describe('glob', () => {
  it('matches globs and directory prefixes', () => {
    expect(matchesClaim('src/a/b.ts', 'src/**')).toBe(true)
    expect(matchesClaim('src/a/b.ts', 'src/*.ts')).toBe(false)
    expect(matchesClaim('src/b.ts', 'src/*.ts')).toBe(true)
    expect(matchesClaim('src/a/b.ts', 'src/a')).toBe(true)
    expect(matchesClaim('src/ab.ts', 'src/a')).toBe(false)
  })
})
