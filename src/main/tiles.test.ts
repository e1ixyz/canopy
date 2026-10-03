import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describeDbUrl, parseEnv } from './dotenv'
import { listHosts, parseSshConfig } from './hosts'
import { listSkills, parseSkill } from './skills'
import { baseName, commandFor } from './tiles'

describe('commandFor', () => {
  it('builds per-kind commands without secrets on the command line', () => {
    expect(commandFor({ kind: 'host', host: 'office-dj' }).command).toBe('ssh office-dj')
    expect(commandFor({ kind: 'host', host: 'box', claude: true }).command).toBe(`ssh -t box 'exec $SHELL -lc claude'`)
    const db = commandFor({ kind: 'db', envFile: '.env', varName: 'DATABASE_URL' }, { dbUrl: 'postgres://u:secret@h/db' })
    expect(db.command).toBe('psql "$ORCH_DB_URL"')
    expect(db.command).not.toContain('secret')
    expect(db.env.ORCH_DB_URL).toBe('postgres://u:secret@h/db')
    expect(commandFor({ kind: 'db', envFile: '.env.test', varName: 'DATABASE_URL' }).command).toContain('No DATABASE_URL in .env.test')
    expect(commandFor({ kind: 'deploy', project: 'p-1', environment: 'staging', service: 'my web' }).command).toBe(`railway logs -p p-1 -e staging -s 'my web'`)
  })
  it('names tiles', () => {
    expect(baseName({ kind: 'host', host: 'admin@mac-studio.local -i ~/.ssh/k' })).toBe('mac-studio.local')
    expect(baseName({ kind: 'deploy', project: 'p', environment: 'production', service: 'web' })).toBe('railway:production')
    expect(baseName({ kind: 'db', envFile: '.env', varName: 'X' }, 'feat/x')).toBe('db:feat/x')
  })
})

describe('dotenv', () => {
  it('parses the usual shapes', () => {
    expect(parseEnv('# c\nexport A=1\nB="two words"\nC=\'x#y\'\nD=plain # trailing\n\nbad line\nE=')).toEqual({ A: '1', B: 'two words', C: 'x#y', D: 'plain', E: '' })
  })
  it('describes a db url without credentials', () => {
    expect(describeDbUrl('postgres://me:pw@localhost:5433/etwal_x_test')).toEqual({ host: 'localhost', port: '5433', database: 'etwal_x_test', user: 'me' })
    expect(describeDbUrl('nope')).toBeNull()
  })
})

describe('hosts', () => {
  it('reads ssh config aliases and merges app hosts', () => {
    expect(parseSshConfig('Host *\n  User x\nHost office-dj office-dj.local\n  HostName office-dj.local\nhost box\nHost !neg pat?\n')).toEqual(['office-dj', 'box'])
    const dir = mkdtempSync(join(tmpdir(), 'ssh-'))
    writeFileSync(join(dir, 'config'), 'Host office-dj\n')
    const hosts = listHosts([{ name: 'office-dj', source: 'app' }, { name: 'studio', target: 'admin@studio.local', source: 'app' }], join(dir, 'config'))
    expect(hosts).toEqual([
      { name: 'office-dj', source: 'ssh-config' },
      { name: 'studio', target: 'admin@studio.local', source: 'app' },
    ])
  })
})

describe('skills', () => {
  it('parses frontmatter, including folded descriptions', () => {
    expect(parseSkill('---\nname: x\ndescription: "Does a thing"\n---\nbody')).toEqual({ name: 'x', description: 'Does a thing' })
    expect(parseSkill('---\nname: y\ndescription: >\n  line one\n  line two\nother: 1\n---')).toEqual({ name: 'y', description: 'line one line two' })
  })
  it('lists user, plugin and project skills', () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    const mk = (dir: string, desc: string) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'SKILL.md'), `---\nname: n\ndescription: ${desc}\n---\n`)
    }
    mk(join(home, '.claude/skills/ship'), 'user ship')
    mk(join(home, 'plug/skills/deploy'), 'plugin deploy')
    mkdirSync(join(home, '.claude/plugins'), { recursive: true })
    writeFileSync(join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'vercel@mkt': [{ installPath: join(home, 'plug') }] } }))
    mk(join(home, 'repo/.claude/skills/ship'), 'project ship')
    expect(listSkills(join(home, 'repo'), home)).toEqual([
      { name: 'ship', description: 'project ship', source: 'project' },
      { name: 'vercel:deploy', description: 'plugin deploy', source: 'plugin' },
    ])
  })
})

describe('railway', () => {
  it('classifies variables by key without exposing values', async () => {
    const { classifyVars, linkedProject } = await import('./railway')
    expect(classifyVars({ A: '1', B: '2', C: '3', S: 'x' }, { A: '1', B: 'other', D: '4', S: null })).toEqual([
      { key: 'A', status: 'same' },
      { key: 'B', status: 'differs' },
      { key: 'C', status: 'local' },
      { key: 'D', status: 'remote' },
      { key: 'S', status: 'sealed' },
    ])
    const dir = mkdtempSync(join(tmpdir(), 'rw-'))
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ projects: { '/r/app': { project: 'p1', environmentName: 'staging', service: null } } }))
    expect(linkedProject(['/r/app-wt', '/r/app'], join(dir, 'config.json'))).toEqual({ project: 'p1', environment: 'staging', service: undefined })
    expect(linkedProject(['/nope'], join(dir, 'config.json'))).toBeNull()
  })
})

describe('db', () => {
  it('finds db scripts and flags destructive ones', async () => {
    const { dbScripts, envFilesWith } = await import('./db')
    expect(dbScripts({ scripts: { dev: 'x', 'db:seed': 'x', 'db:reset': 'x', migrate: 'x', 'seed-images': 'x', 'db:push': 'x', lint: 'x' } }, 'bun')).toEqual([
      { name: 'db:seed', command: 'bun run db:seed', danger: false },
      { name: 'db:reset', command: 'bun run db:reset', danger: true },
      { name: 'migrate', command: 'bun run migrate', danger: false },
      { name: 'seed-images', command: 'bun run seed-images', danger: false },
      { name: 'db:push', command: 'bun run db:push', danger: true },
    ])
    const dir = mkdtempSync(join(tmpdir(), 'db-'))
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://x/y')
    writeFileSync(join(dir, '.env.test'), 'DATABASE_URL=postgres://x/y_test')
    writeFileSync(join(dir, '.env.example'), 'DATABASE_URL=postgres://ex')
    writeFileSync(join(dir, '.env.local'), 'OTHER=1')
    expect(envFilesWith(dir, 'DATABASE_URL')).toEqual(['.env', '.env.test'])
  })
})
