import { AnnotateSheet } from './components/AnnotateSheet'
import { DeploySetupSheet } from './components/DeploySetup'
import { DesignSheet } from './components/DesignView'
import { AnimatePresence, LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
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
import { focusTerm } from './lib/terms'
import { findTile, useApp } from './store/app'

function Background() {
  const colors = useApp(
    useShallow((s) => {
      const live = new Set(Object.values(s.sessions).map((x) => x.projectId))
      return s.projects.filter((p) => live.has(p.id)).map((p) => p.color)
    }),
  )
  const palette = [...colors, '#8b5cf6', '#0ea5e9', '#ec4899'].slice(0, 3)
  return (
    <div className="noise pointer-events-none absolute inset-0 overflow-hidden">
      {palette.map((c, i) => (
        <motion.div
          key={i}
          className="blob"
          style={{ width: 620, height: 620, background: c }}
          initial={false}
          animate={{
            x: [[-200, 100, -100][i], [200, -150, 300][i], [-200, 100, -100][i]],
            y: [[-150, 400, 600][i], [100, 200, 300][i], [-150, 400, 600][i]],
            background: c,
          }}
          transition={{ duration: 28 + i * 6, repeat: Infinity, ease: 'easeInOut', background: { duration: 2 } }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.04),transparent_60%)]" />
    </div>
  )
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

  return (
    <MotionConfig reducedMotion={settings.reduceMotion ? 'always' : 'user'}>
      <div className="relative flex h-full flex-col">
        <Background />
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
