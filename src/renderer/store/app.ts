import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type {
  BusMessage,
  Claim,
  GitStatus,
  Page,
  PreviewState,
  Project,
  RecentProject,
  Session,
  Settings,
  UpdateState,
  SpawnRequest,
  Tile,
  UsageSnapshot,
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/types'
import { orch } from '../lib/orch'
import { disposeTerm, focusTerm, onPtyData, setLinkHandler } from '../lib/terms'

export interface Confirm {
  requestId: string
  req: SpawnRequest & { worktree?: string; branch?: string }
  by: string
}

export interface Toast {
  id: string
  text: string
  tone: 'info' | 'ok' | 'warn' | 'error'
}

export interface Packet {
  id: string
  from: string
  to: string
  kind: BusMessage['kind']
}

export interface NewSessionOpts {
  projectPath?: string
  mode?: 'checkout' | 'worktree' | 'resume' | 'pickup'
  kind?: 'claude' | 'shell'
}

interface AppStore {
  ready: boolean
  /** unused saved handoffs per project path */
  handoffCounts: Record<string, number>
  /** bumps whenever the shelf changes, so open lists reload */
  handoffsRev: number
  view: 'launcher' | 'workspace'
  projects: Project[]
  recents: RecentProject[]
  sessions: Record<string, Session>
  pages: Page[]
  activePageId: string | null
  messages: BusMessage[]
  claims: Claim[]
  settings: Settings
  git: Record<string, GitStatus | null>
  busOpen: boolean
  paletteOpen: boolean
  overviewOpen: boolean
  settingsOpen: boolean
  worktreesOpen: boolean
  broadcastOpen: boolean
  helpOpen: boolean
  usage: UsageSnapshot | null
  /** webContents id of each session's preview, for screenshot sets */
  previewWc: Record<string, number>
  shotSet: { sessionId: string; tileId: string } | null
  goalFor: string | null
  shipFor: string | null
  prFor: string | null
  /** the Railway setup sheet; sessionId set means re-pointing an existing deploy tile */
  deploySetup: { cwd: string; projectPath: string; sessionId?: string } | null
  /** the design-URL sheet, opened beside this session */
  designFor: string | null
  /** a capture being marked up before it goes to a session */
  annotate: { sessionId: string; image: string; label: string } | null
  newSession: NewSessionOpts | null
  selected: string[]
  confirms: Confirm[]
  toasts: Toast[]
  packets: Packet[]
  update: UpdateState | null
  /** the origin/main sha the user said Later to; a newer push prompts again */
  updateDismissed: string | null
  activeTileId: string | null
  userUnread: number

  init: () => Promise<void>
  setView: (v: AppStore['view']) => void
  refreshRecents: () => Promise<void>
  openProject: (path: string) => Promise<void>
  spawn: (req: SpawnRequest, pageId?: string) => Promise<Session | null>
  addTile: (sessionId: string, pageId?: string) => void
  /** put a new tile right after another session's tile (same page), or at the end */
  addTileAfter: (sessionId: string, afterSessionId?: string) => void
  closeTile: (tileId: string) => Promise<void>
  moveTile: (tileId: string, toPageId: string) => void
  swapTiles: (a: string, b: string) => void
  focusTile: (tileId: string | null) => void
  setActiveTile: (tileId: string) => void
  setPreview: (tileId: string, patch: Partial<PreviewState>) => void
  togglePreview: (tileId: string, url?: string) => void
  addPage: (name?: string) => string
  renamePage: (id: string, name: string) => void
  removePage: (id: string) => Promise<void>
  setActivePage: (id: string) => void
  toggleSelect: (tileId: string) => void
  clearSelection: () => void
  toast: (text: string, tone?: Toast['tone']) => void
  /** Ask GitHub now; says so when the build is current (an update shows its own card) */
  checkForUpdates: () => Promise<void>
  set: (p: Partial<AppStore>) => void
  jumpToSession: (sessionId: string) => void
  refreshGit: (cwd: string) => Promise<void>
  updateSettings: (p: Partial<Settings>) => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const savePages = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { pages, activePageId } = useApp.getState()
    orch.invoke('pages:save', pages, activePageId)
  }, 250)
}

const updatePages = (fn: (pages: Page[]) => Page[]) => {
  useApp.setState((s) => ({ pages: fn(s.pages) }))
  savePages()
}

export const findTile = (pages: Page[], tileId: string) => {
  for (const p of pages) {
    const t = p.tiles.find((x) => x.id === tileId)
    if (t) return { page: p, tile: t }
  }
  return null
}

export const tileForSession = (pages: Page[], sessionId: string) => {
  for (const p of pages) {
    const t = p.tiles.find((x) => x.sessionId === sessionId)
    if (t) return { page: p, tile: t }
  }
  return null
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  view: 'launcher',
  projects: [],
  recents: [],
  sessions: {},
  pages: [],
  activePageId: null,
  messages: [],
  claims: [],
  settings: DEFAULT_SETTINGS,
  git: {},
  busOpen: false,
  paletteOpen: false,
  overviewOpen: false,
  settingsOpen: false,
  worktreesOpen: false,
  broadcastOpen: false,
  helpOpen: false,
  usage: null,
  previewWc: {},
  shotSet: null,
  goalFor: null,
  shipFor: null,
  prFor: null,
  deploySetup: null,
  designFor: null,
  annotate: null,
  newSession: null,
  selected: [],
  confirms: [],
  toasts: [],
  packets: [],
  update: null,
  updateDismissed: null,
  activeTileId: null,
  userUnread: 0,
  handoffCounts: {},
  handoffsRev: 0,

  init: async () => {
    const st = await orch.invoke('state:get')
    const sessions: Record<string, Session> = {}
    for (const s of st.sessions) sessions[s.id] = s
    // Drop tiles whose session no longer exists, and adopt live sessions no page shows.
    const pages = st.pages.map((p) => ({ ...p, tiles: p.tiles.filter((t) => sessions[t.sessionId]) }))
    const shown = new Set(pages.flatMap((p) => p.tiles.map((t) => t.sessionId)))
    const orphans = st.sessions.filter((s) => !shown.has(s.id) && s.kind !== 'dev')
    const live = orphans.filter((s) => s.status !== 'exited' && s.status !== 'error')
    for (const s of orphans) if (!live.includes(s)) orch.invoke('session:remove', s.id)
    if (live.length) pages.push({ id: nanoid(8), name: 'Recovered', tiles: live.map((s) => ({ id: nanoid(8), sessionId: s.id })), focusedTileId: null })
    set({
      projects: st.projects,
      sessions,
      pages,
      activePageId: st.activePageId ?? pages[0]?.id ?? null,
      messages: st.messages,
      claims: st.claims,
      settings: st.settings,
      view: pages.some((p) => p.tiles.length) ? 'workspace' : 'launcher',
      ready: true,
    })
    get().refreshRecents()

    orch.on('pty:data', (id, data, seq) => onPtyData(id, data, seq))
    const refreshHandoffs = () => orch.invoke('handoffs:counts').then((handoffCounts) => set({ handoffCounts }))
    refreshHandoffs()
    orch.on('handoffs:changed', () => {
      refreshHandoffs()
      set((st) => ({ handoffsRev: st.handoffsRev + 1 }))
    })
    orch.on('session:update', (s) => set((st) => ({ sessions: { ...st.sessions, [s.id]: s } })))
    orch.on('session:removed', (id) => {
      disposeTerm(id)
      set((st) => {
        const sessions = { ...st.sessions }
        delete sessions[id]
        return { sessions }
      })
      updatePages((pages) => pages.map((p) => ({ ...p, tiles: p.tiles.filter((t) => t.sessionId !== id) })))
    })
    orch.on('bus:message', (m) => {
      set((st) => ({
        messages: [...st.messages.slice(-499), m],
        userUnread: m.to === 'user' && !st.busOpen ? st.userUnread + 1 : st.userUnread,
      }))
      if (m.kind === 'message' || m.kind === 'handoff' || m.kind === 'broadcast') {
        const targets = m.to === '*' || m.to === 'project' ? Object.keys(get().sessions).filter((id) => id !== m.from) : [m.to]
        const packets = targets.slice(0, 6).map((to) => ({ id: nanoid(6), from: m.from, to, kind: m.kind }))
        set((st) => ({ packets: [...st.packets, ...packets] }))
      }
    })
    orch.on('bus:cleared', () => set({ messages: [] }))
    orch.on('claims:update', (claims) => set({ claims }))
    orch.on('ui:openPreview', (sid, url) => {
      const hit = tileForSession(get().pages, sid)
      if (!hit) return
      get().setPreview(hit.tile.id, { open: true, url })
    })
    orch.on('ui:confirmSpawn', (requestId, req, by) => set((st) => ({ confirms: [...st.confirms, { requestId, req, by }] })))
    orch.on('ui:focusSession', (sid) => get().jumpToSession(sid))
    orch.on('usage:update', (usage) => set({ usage }))
    orch.invoke('usage:get').then((usage) => set({ usage }))
    orch.on('ui:toast', (text, tone) => get().toast(text, tone))
    orch.on('update:state', (update) => set({ update }))
    orch.invoke('update:get').then((update) => set({ update }))
    orch.on('ui:previewWidth', (sid, width) => {
      const hit = tileForSession(get().pages, sid)
      if (hit) get().setPreview(hit.tile.id, { open: true, width })
    })
    orch.on('ui:replaceTile', (oldSid, newSid) => {
      // A fresh session takes over the old one's tile, preview and all.
      const hit = tileForSession(get().pages, oldSid)
      if (!hit) return get().addTile(newSid)
      updatePages((pages) => pages.map((p) => ({ ...p, tiles: p.tiles.map((t) => (t.sessionId === oldSid ? { ...t, sessionId: newSid } : t)) })))
      setTimeout(() => orch.invoke('session:remove', oldSid), 1500)
      setTimeout(() => focusTerm(newSid), 400)
      get().toast('Fresh session took over with the handoff', 'ok')
    })
    orch.on('ui:addTile', (sid, near) => {
      if (tileForSession(get().pages, sid)) return
      // Workers land on the page of whoever spawned them.
      const page = near ? tileForSession(get().pages, near)?.page.id : undefined
      setTimeout(() => get().addTile(sid, page), 50)
    })
    setLinkHandler((sid, url) => {
      if (/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(url)) {
        const hit = tileForSession(get().pages, sid)
        if (hit) return get().setPreview(hit.tile.id, { open: true, url })
      }
      orch.invoke('shell:openExternal', url)
    })
  },

  setView: (view) => set({ view }),

  refreshRecents: async () => {
    const recents = await orch.invoke('recents:list')
    set({ recents })
  },

  openProject: async (path) => {
    // A double-click (or Enter held down) must not open the same project twice.
    if (opening.has(path)) return
    opening.add(path)
    try {
      await openProjectOnce(path)
    } finally {
      opening.delete(path)
    }
  },

  spawn: async (req, pageId) => {
    try {
      const s = await orch.invoke('session:spawn', req)
      set((st) => ({ sessions: { ...st.sessions, [s.id]: s } }))
      get().addTile(s.id, pageId)
      return s
    } catch (e) {
      get().toast(`Could not start session: ${(e as Error).message}`, 'error')
      return null
    }
  },

  addTile: (sessionId, pageId) => {
    let target = pageId ?? get().activePageId
    if (!target || !get().pages.some((p) => p.id === target)) target = get().addPage()
    const tile: Tile = { id: nanoid(8), sessionId }
    updatePages((pages) => pages.map((p) => (p.id === target ? { ...p, tiles: [...p.tiles, tile], focusedTileId: p.focusedTileId ? tile.id : p.focusedTileId } : p)))
    set({ activePageId: target, activeTileId: tile.id, view: 'workspace' })
    setTimeout(() => focusTerm(sessionId), 350)
  },

  addTileAfter: (sessionId, afterSessionId) => {
    const hit = afterSessionId ? tileForSession(get().pages, afterSessionId) : null
    if (!hit) return get().addTile(sessionId)
    const tile: Tile = { id: nanoid(8), sessionId }
    updatePages((pages) =>
      pages.map((p) => {
        if (p.id !== hit.page.id) return p
        const i = p.tiles.findIndex((t) => t.id === hit.tile.id)
        return { ...p, tiles: [...p.tiles.slice(0, i + 1), tile, ...p.tiles.slice(i + 1)] }
      }),
    )
    set({ activePageId: hit.page.id, activeTileId: tile.id, view: 'workspace' })
  },

  closeTile: async (tileId) => {
    const hit = findTile(get().pages, tileId)
    if (!hit) return
    const sid = hit.tile.sessionId
    updatePages((pages) =>
      pages.map((p) => ({
        ...p,
        tiles: p.tiles.filter((t) => t.id !== tileId),
        focusedTileId: p.focusedTileId === tileId ? null : p.focusedTileId,
      })),
    )
    set((st) => ({ selected: st.selected.filter((x) => x !== tileId) }))
    await orch.invoke('session:remove', sid)
  },

  moveTile: (tileId, toPageId) => {
    const hit = findTile(get().pages, tileId)
    if (!hit || hit.page.id === toPageId) return
    updatePages((pages) =>
      pages.map((p) => {
        if (p.id === hit.page.id)
          return { ...p, tiles: p.tiles.filter((t) => t.id !== tileId), focusedTileId: p.focusedTileId === tileId ? null : p.focusedTileId }
        if (p.id === toPageId) return { ...p, tiles: [...p.tiles, hit.tile] }
        return p
      }),
    )
  },

  swapTiles: (a, b) => {
    if (a === b) return
    updatePages((pages) =>
      pages.map((p) => {
        const i = p.tiles.findIndex((t) => t.id === a)
        const j = p.tiles.findIndex((t) => t.id === b)
        if (i < 0 || j < 0) return p
        const tiles = [...p.tiles]
        const [moved] = tiles.splice(i, 1)
        tiles.splice(j, 0, moved)
        return { ...p, tiles }
      }),
    )
  },

  focusTile: (tileId) => {
    const pageId = get().activePageId
    updatePages((pages) => pages.map((p) => (p.id === pageId ? { ...p, focusedTileId: tileId } : p)))
    if (tileId) {
      set({ activeTileId: tileId })
      const hit = findTile(get().pages, tileId)
      if (hit) setTimeout(() => focusTerm(hit.tile.sessionId), 60)
    }
  },

  setActiveTile: (tileId) => {
    if (get().activeTileId === tileId) return
    set({ activeTileId: tileId })
    const hit = findTile(get().pages, tileId)
    const s = hit && get().sessions[hit.tile.sessionId]
    if (s?.attention && s.status !== 'waiting') orch.invoke('session:ack', s.id)
  },

  setPreview: (tileId, patch) => {
    updatePages((pages) =>
      pages.map((p) => ({
        ...p,
        tiles: p.tiles.map((t) =>
          t.id === tileId ? { ...t, preview: { open: true, url: '', width: 'fill', split: 0.45, ...t.preview, ...patch } } : t,
        ),
      })),
    )
  },

  togglePreview: (tileId, url) => {
    const hit = findTile(get().pages, tileId)
    if (!hit) return
    const open = !hit.tile.preview?.open
    get().setPreview(tileId, { open, ...(url ? { url } : {}) })
  },

  addPage: (name) => {
    const id = nanoid(8)
    const n = get().pages.length + 1
    updatePages((pages) => [...pages, { id, name: name ?? `Page ${n}`, tiles: [], focusedTileId: null }])
    set({ activePageId: id })
    return id
  },

  renamePage: (id, name) => updatePages((pages) => pages.map((p) => (p.id === id ? { ...p, name } : p))),

  removePage: async (id) => {
    const page = get().pages.find((p) => p.id === id)
    if (!page) return
    for (const t of page.tiles) await orch.invoke('session:remove', t.sessionId)
    updatePages((pages) => pages.filter((p) => p.id !== id))
    const rest = get().pages
    set({ activePageId: rest[rest.length - 1]?.id ?? null, view: rest.length ? get().view : 'launcher' })
  },

  setActivePage: (id) => {
    set({ activePageId: id, view: 'workspace' })
    savePages()
  },

  toggleSelect: (tileId) =>
    set((st) => ({ selected: st.selected.includes(tileId) ? st.selected.filter((x) => x !== tileId) : [...st.selected, tileId] })),
  clearSelection: () => set({ selected: [] }),

  checkForUpdates: async () => {
    set({ updateDismissed: null })
    const u = await orch.invoke('update:check')
    set({ update: u })
    if (!u.enabled) get().toast('Updates work in builds installed with bun run install-app', 'warn')
    else if (u.phase === 'idle') get().toast(`Canopy is up to date (${u.built})`, 'ok')
  },
  toast: (text, tone = 'info') => {
    const id = nanoid(6)
    set((st) => ({ toasts: [...st.toasts, { id, text, tone }] }))
    setTimeout(() => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 7000 : 3800)
  },

  set: (p) => set(p),

  jumpToSession: (sessionId) => {
    const hit = tileForSession(get().pages, sessionId)
    if (!hit) return
    set({ activePageId: hit.page.id, view: 'workspace', overviewOpen: false, paletteOpen: false, activeTileId: hit.tile.id })
    savePages()
    setTimeout(() => focusTerm(sessionId), 380)
  },

  refreshGit: async (cwd) => {
    const g = await orch.invoke('git:status', cwd)
    set((st) => ({ git: { ...st.git, [cwd]: g } }))
  },

  updateSettings: async (p) => {
    const settings = await orch.invoke('settings:set', p)
    set({ settings })
  },
}))

const opening = new Set<string>()

async function openProjectOnce(path: string) {
  const get = useApp.getState
  const project = await orch.invoke('project:open', path)
  useApp.setState((st) => ({ projects: [...st.projects.filter((p) => p.id !== project.id), project] }))
  const { pages, sessions } = get()
  const existing = pages.find((p) => p.tiles.some((t) => sessions[t.sessionId]?.projectId === project.id))
  if (existing) {
    useApp.setState({ activePageId: existing.id, view: 'workspace' })
    savePages()
    return
  }
  const pageId = get().addPage(project.name)
  useApp.setState({ view: 'workspace' })
  const inUse = await orch.invoke('session:inUse', path)
  if (inUse.length) useApp.setState({ newSession: { projectPath: path, mode: 'worktree' } })
  else await get().spawn({ kind: 'claude', projectPath: path, cwd: path }, pageId)
}

export const useActivePage = () => useApp((s) => s.pages.find((p) => p.id === s.activePageId) ?? null)
