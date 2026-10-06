import { copyFileSync, existsSync, mkdirSync, symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_PROFILE_ID, profilesOf, type Profile, type Settings } from '@shared/types'

/**
 * Claude profiles: each is a config dir handed to Claude Code as CLAUDE_CONFIG_DIR, so it has
 * its own login (Keychain entry), settings, history and transcripts. The default profile is
 * ~/.claude with the variable left unset, which is exactly how sessions ran before profiles.
 */

export function expandTilde(p: string, home = homedir()) {
  return p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p
}

export function profileDir(p: Pick<Profile, 'configDir'> | undefined, home = homedir()) {
  return p?.configDir ? expandTilde(p.configDir, home) : join(home, '.claude')
}

export function findProfile(settings: Pick<Settings, 'profiles'>, id: string | undefined) {
  const list = profilesOf(settings)
  return list.find((p) => p.id === id) ?? list[0]
}

/** The profile a new session runs under: asked for, else the project's, else the active one */
export function resolveProfileId(settings: Pick<Settings, 'profiles' | 'activeProfileId'>, requested?: string, projectDefault?: string) {
  const ids = new Set(profilesOf(settings).map((p) => p.id))
  for (const id of [requested, projectDefault, settings.activeProfileId]) if (id && ids.has(id)) return id
  return DEFAULT_PROFILE_ID
}

/** Env for a session on this profile; empty for the default so nothing changes for it */
export function profileEnv(p: Pick<Profile, 'configDir'> | undefined, home = homedir()): Record<string, string> {
  return p?.configDir ? { CLAUDE_CONFIG_DIR: profileDir(p, home) } : {}
}

/** Every profile's config dir, once each (two profiles may point at the same folder) */
export function claudeDirs(settings: Pick<Settings, 'profiles'>, home = homedir()) {
  const seen = new Set<string>()
  const out: { id: string; dir: string }[] = []
  for (const p of profilesOf(settings)) {
    const dir = profileDir(p, home)
    if (seen.has(dir)) continue
    seen.add(dir)
    out.push({ id: p.id, dir })
  }
  return out
}

export function profileSlug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'profile'
  )
}

export interface ProfileSetup {
  /** copy settings.json and CLAUDE.md from ~/.claude when the new folder has none */
  copySettings?: boolean
  /** symlink ~/.claude/skills into the new folder so both profiles share skills */
  linkSkills?: boolean
}

/** Make a profile's folder, seeding it from ~/.claude as asked. Never overwrites what is there. */
export function prepareProfileDir(dir: string, setup: ProfileSetup, home = homedir()) {
  const base = join(home, '.claude')
  if (dir === base) return
  mkdirSync(dir, { recursive: true })
  if (setup.copySettings)
    for (const f of ['settings.json', 'CLAUDE.md']) {
      const from = join(base, f)
      const to = join(dir, f)
      if (existsSync(from) && !existsSync(to)) copyFileSync(from, to)
    }
  if (setup.linkSkills) {
    const from = join(base, 'skills')
    const to = join(dir, 'skills')
    try {
      if (existsSync(from)) symlinkSync(from, to)
    } catch {
      /* something is already there; leave it */
    }
  }
}
