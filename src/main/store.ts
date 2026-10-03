import { app } from 'electron'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type AppState } from '@shared/types'

const dir = () => app.getPath('userData')
const file = () => join(dir(), 'state.json')

const empty = (): AppState => ({
  projects: [],
  pages: [],
  activePageId: null,
  sessions: [],
  messages: [],
  claims: [],
  reservations: {},
  settings: { ...DEFAULT_SETTINGS },
  shotSets: {},
  deployTargets: {},
})

let state: AppState = empty()
let timer: NodeJS.Timeout | null = null

export function loadState(): AppState {
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<AppState>
    state = { ...empty(), ...raw, settings: { ...DEFAULT_SETTINGS, ...raw.settings } }
  } catch {
    state = empty()
  }
  return state
}

export const getState = () => state

export function saveState(now = false) {
  if (timer) clearTimeout(timer)
  const write = () => {
    timer = null
    mkdirSync(dir(), { recursive: true })
    const tmp = file() + '.tmp'
    // Keep the bus log bounded so the state file doesn't grow forever.
    const out = { ...state, messages: state.messages.slice(-500) }
    writeFileSync(tmp, JSON.stringify(out, null, 2))
    renameSync(tmp, file())
  }
  if (now) write()
  else timer = setTimeout(write, 400)
}

export function sessionDir(id: string) {
  const d = join(dir(), 'sessions', id)
  mkdirSync(d, { recursive: true })
  return d
}
