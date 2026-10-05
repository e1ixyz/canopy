import { AnnotateSheet } from './components/AnnotateSheet'
import { DeploySetupSheet } from './components/DeploySetup'
import { DesignSheet } from './components/DesignView'
import { AnimatePresence, LayoutGroup, MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { BusDrawer } from './components/BusDrawer'
import { HelpPanel } from './components/HelpPanel'
import { GoalSheet, ShipSheet, ShotSetSheet } from './components/Sheets'
import { CommandPalette } from './components/CommandPalette'
import { Dock } from './components/Dock'
import { Launcher } from './components/Launcher'
import { NewSessionSheet } from './components/NewSessionSheet'
import { Overview } from './components/Overview'
import { BroadcastSheet, SettingsPanel, WorktreesPanel } from './components/Panels'
import { Packets, SpawnConfirms, Toasts } from './components/Overlays'
import { TopBar } from './components/TopBar'
import { Workspace } from './components/Workspace'
import { focusTerm, setTermPalette } from './lib/terms'
import { applyMode, currentMode, onModeChange, termPalette, type Mode } from './lib/theme'
import { findTile, useApp } from './store/app'

/** Puts the resolved light/dark mode on <html>, and restyles terminals to match */
function useTheme() {
  const [mode, setMode] = useState<Mode>(currentMode)
  useEffect(() => onModeChange(setMode), [])
  useEffect(() => {
    applyMode(mode)
    setTermPalette(termPalette(mode))
  }, [mode])
}

/** Any sheet, panel or full-screen overlay that sits over the workspace */
function modalOpen(st: ReturnType<typeof useApp.getState>) {
  return !!(
    st.paletteOpen ||
    st.helpOpen ||
    st.settingsOpen ||
    st.overviewOpen ||
    st.worktreesOpen ||
    st.broadcastOpen ||
    st.newSession ||
    st.goalFor ||
    st.shipFor ||
    st.designFor ||
    st.deploySetup ||
    st.shotSet ||
    st.annotate
  )
}

function closeModals() {
  useApp.getState().set({
    paletteOpen: false,
    helpOpen: false,
    settingsOpen: false,
    overviewOpen: false,
    worktreesOpen: false,
    broadcastOpen: false,
    newSession: null,
    goalFor: null,
    shipFor: null,
    designFor: null,
    deploySetup: null,
    shotSet: null,
    annotate: null,
  })
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useApp.getState()
      if (!e.metaKey) return
      const page = st.pages.find((p) => p.id === st.activePageId)
      const activeTile = st.activeTileId ? findTile(st.pages, st.activeTileId) : null
      const session = activeTile ? st.sessions[activeTile.tile.sessionId] : undefined
      const projectPath = st.projects.find((p) => p.id === session?.projectId)?.path ?? st.projects[0]?.path
      const k = e.key.toLowerCase()
      // ⌘↵ in a text field belongs to that field (sheets submit with it); xterm's own textarea excepted.
      const el = e.target as HTMLElement | null
      const editable = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) && !el.classList.contains('xterm-helper-textarea')
      if (k === 'enter' && editable) return
      // With a sheet or panel open, tile and page shortcuts would act on the workspace hidden behind it.
      if (k !== 'k' && k !== '/' && modalOpen(st)) {
        if (k !== 'w') return
        e.preventDefault()
        e.stopPropagation()
        closeModals()
        return
      }
      // Tile shortcuts act on a tile you can see: not from behind the launcher.
      const tileScoped = k === 'w' || k === 'enter' || /^[1-9]$/.test(k) || (k === 'p' && e.shiftKey)
      if (tileScoped && st.view !== 'workspace') return
      let handled = true
      if (k === 'k') st.set({ paletteOpen: !st.paletteOpen })
      else if (k === '/') st.set({ helpOpen: !st.helpOpen })
      else if (k === 't' && e.shiftKey) st.set({ newSession: { projectPath, mode: 'worktree' } })
      else if (k === 't') st.set({ newSession: { projectPath } })
      else if (k === 'o' && e.shiftKey) st.set({ overviewOpen: !st.overviewOpen })
      else if (k === 'o') st.set({ view: 'launcher' })
      else if (k === 'b') st.set({ busOpen: !st.busOpen, userUnread: 0 })
      else if (k === 'j') {
        const list = Object.values(st.sessions)
        const s = list.find((x) => x.status === 'waiting') ?? list.find((x) => x.attention && x.status === 'idle')
        if (s) st.jumpToSession(s.id)
      } else if (k === 'p' && e.shiftKey && activeTile) st.togglePreview(activeTile.tile.id)
      else if (k === 'enter' && activeTile) st.focusTile(page?.focusedTileId === activeTile.tile.id ? null : activeTile.tile.id)
      else if (k === 'w' && activeTile && session) {
        if (session.status !== 'working' || confirm(`${session.name} is working. Stop it and close?`)) st.closeTile(activeTile.tile.id)
      } else if (/^[1-9]$/.test(k) && page) {
        const t = page.tiles[Number(k) - 1]
        if (t) {
          st.setActiveTile(t.id)
          if (page.focusedTileId) st.focusTile(t.id)
          focusTerm(t.sessionId)
        }
      } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const i = st.pages.findIndex((p) => p.id === st.activePageId)
        const next = st.pages[i + (e.key === 'ArrowRight' ? 1 : -1)]
        if (next) st.setActivePage(next.id)
      } else handled = false
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

export function App() {
  const { ready, view, init, settings } = useApp()
  useEffect(() => {
    init()
  }, [init])
  useShortcuts()
  useTheme()

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <div className="relative flex h-full flex-col">
        <div className="orch-backdrop pointer-events-none absolute inset-0" />
        <LayoutGroup>
          <TopBar />
          <div className="relative min-h-0 flex-1">
            {ready && <Workspace hidden={view === 'launcher'} />}
            <AnimatePresence>{ready && view === 'launcher' && <Launcher key="l" />}</AnimatePresence>
            <AnimatePresence>{ready && view === 'workspace' && <Dock key="dock" />}</AnimatePresence>
            <BusDrawer />
          </div>
        </LayoutGroup>
        <NewSessionSheet />
        <CommandPalette />
        <Overview />
        <HelpPanel />
        <ShotSetSheet />
        <GoalSheet />
        <ShipSheet />
        <DeploySetupSheet />
        <AnnotateSheet />
        <DesignSheet />
        <SettingsPanel />
        <BroadcastSheet />
        <WorktreesPanel />
        <SpawnConfirms />
        <Packets />
        <Toasts />
      </div>
    </MotionConfig>
  )
}
