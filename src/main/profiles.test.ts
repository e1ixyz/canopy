import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { profilesOf } from '@shared/types'
import { claudeDirs, expandTilde, prepareProfileDir, profileDir, profileEnv, profileSlug, resolveProfileId } from './profiles'
import { listRecents, listTranscripts, projectSlug } from './recents'
import { listSkills } from './skills'

const home = '/home/me'
const two = { profiles: [{ id: 'personal', name: 'Personal', color: 'violet', configDir: '~/.claude-personal' }] }

describe('profiles', () => {
  it('always lists the default first', () => {
    expect(profilesOf({}).map((p) => p.id)).toEqual(['default'])
    expect(profilesOf(two).map((p) => p.id)).toEqual(['default', 'personal'])
    const renamed = { profiles: [{ id: 'personal', name: 'P', color: 'violet', configDir: '~/p' }, { id: 'default', name: 'Work', color: 'orange' }] }
    expect(profilesOf(renamed).map((p) => p.name)).toEqual(['Work', 'P'])
  })

  it('maps a profile to its folder', () => {
    expect(profileDir(undefined, home)).toBe('/home/me/.claude')
    expect(profileDir({ configDir: '~/.claude-personal' }, home)).toBe('/home/me/.claude-personal')
    expect(profileDir({ configDir: '/opt/claude' }, home)).toBe('/opt/claude')
    expect(expandTilde('~', home)).toBe(home)
  })

  it('sets CLAUDE_CONFIG_DIR only for a non-default profile', () => {
    expect(profileEnv(undefined, home)).toEqual({})
    expect(profileEnv({}, home)).toEqual({})
    expect(profileEnv({ configDir: '~/.claude-personal' }, home)).toEqual({ CLAUDE_CONFIG_DIR: '/home/me/.claude-personal' })
  })

  it('picks the requested profile, then the project, then the active one', () => {
    const s = { ...two, activeProfileId: 'personal' }
    expect(resolveProfileId(s, 'default', 'personal')).toBe('default')
    expect(resolveProfileId(s, undefined, 'default')).toBe('default')
    expect(resolveProfileId(s)).toBe('personal')
    expect(resolveProfileId({}, 'gone', 'gone')).toBe('default')
    expect(resolveProfileId({ ...two, activeProfileId: 'gone' })).toBe('default')
  })

  it('lists each folder once', () => {
    const dup = { profiles: [...two.profiles, { id: 'alias', name: 'Alias', color: 'teal', configDir: '/home/me/.claude-personal' }] }
    expect(claudeDirs(dup, home)).toEqual([
      { id: 'default', dir: '/home/me/.claude' },
      { id: 'personal', dir: '/home/me/.claude-personal' },
    ])
  })

  it('slugs names into ids', () => {
    expect(profileSlug('Work (Aboard)')).toBe('work-aboard')
    expect(profileSlug('!!')).toBe('profile')
  })

  it('seeds a new folder from ~/.claude without overwriting', () => {
    const h = mkdtempSync(join(tmpdir(), 'home-'))
    mkdirSync(join(h, '.claude', 'skills'), { recursive: true })
    writeFileSync(join(h, '.claude', 'settings.json'), '{"a":1}')
    writeFileSync(join(h, '.claude', 'CLAUDE.md'), 'base')
    const dir = join(h, '.claude-personal')
    mkdirSync(dir)
    writeFileSync(join(dir, 'CLAUDE.md'), 'mine')
    prepareProfileDir(dir, { copySettings: true, linkSkills: true }, h)
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).toBe('{"a":1}')
    expect(readFileSync(join(dir, 'CLAUDE.md'), 'utf8')).toBe('mine')
    expect(lstatSync(join(dir, 'skills')).isSymbolicLink()).toBe(true)
    // a second run leaves everything as it is
    prepareProfileDir(dir, { copySettings: true, linkSkills: true }, h)
    const bare = join(h, '.claude-bare')
    prepareProfileDir(bare, {}, h)
    expect(existsSync(bare) && !existsSync(join(bare, 'settings.json'))).toBe(true)
  })
})

describe('reading every profile', () => {
  const h = mkdtempSync(join(tmpdir(), 'home-'))
  const a = join(h, '.claude')
  const b = join(h, '.claude-personal')
  const proj = join(h, 'repo')
  const other = join(h, 'side')
  mkdirSync(proj)
  mkdirSync(other)
  mkdirSync(a, { recursive: true })
  mkdirSync(b, { recursive: true })
  writeFileSync(join(a, 'history.jsonl'), [JSON.stringify({ project: proj, timestamp: 100 }), JSON.stringify({ project: proj, timestamp: 200 })].join('\n'))
  writeFileSync(join(b, 'history.jsonl'), [JSON.stringify({ project: proj, timestamp: 500 }), JSON.stringify({ project: other, timestamp: 300 })].join('\n'))
  const dirs = [
    { id: 'default', dir: a },
    { id: 'personal', dir: b },
  ]

  it('merges history from each config dir', () => {
    const r = listRecents(40, dirs)
    expect(r.map((x) => x.path)).toEqual([proj, other])
    expect(r[0]).toMatchObject({ prompts: 3, lastUsed: 500 })
  })

  it('tags transcripts with the profile that holds them', () => {
    for (const [root, id, t] of [
      [a, 'one', 1000],
      [b, 'two', 2000],
    ] as const) {
      const d = join(root, 'projects', projectSlug(proj))
      mkdirSync(d, { recursive: true })
      const f = join(d, `${id}.jsonl`)
      writeFileSync(f, JSON.stringify({ type: 'user', cwd: proj, message: { content: `hello ${id}` } }) + '\n')
      utimesSync(f, t, t)
    }
    const list = listTranscripts(proj, 30, dirs)
    expect(list.map((x) => [x.id, x.profileId])).toEqual([
      ['two', 'personal'],
      ['one', 'default'],
    ])
  })

  it("reads a profile's own skills", () => {
    mkdirSync(join(b, 'skills', 'mine'), { recursive: true })
    writeFileSync(join(b, 'skills', 'mine', 'SKILL.md'), '---\nname: mine\ndescription: x\n---\n')
    expect(listSkills(undefined, h, b).map((s) => s.name)).toContain('mine')
    expect(listSkills(undefined, h).map((s) => s.name)).not.toContain('mine')
  })
})
