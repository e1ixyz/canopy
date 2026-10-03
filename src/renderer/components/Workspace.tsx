import { AnimatePresence, motion } from 'motion/react'
import { Plus, Sparkles } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Page } from '@shared/types'
import { focusLayout, gridLayout } from '../lib/layout'
import { spring } from '../lib/motion'
import { useApp } from '../store/app'
import { Tile } from './Tile'
import { Button } from './ui'

/** Always mounted (hidden behind the launcher) so webviews and terminals never reload */
export function Workspace({ hidden }: { hidden: boolean }) {
  const { pages, activePageId } = useApp()
  const activeIdx = pages.findIndex((p) => p.id === activePageId)
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={hidden ? { opacity: 0, scale: 0.94, filter: 'blur(12px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={spring.gentle}
      style={{ pointerEvents: hidden ? 'none' : 'auto' }}
    >
      {pages.map((p, i) => (
        <PageView key={p.id} page={p} active={p.id === activePageId} offset={i - activeIdx} />
      ))}
    </motion.div>
  )
}

function PageView({ page, active, offset }: { page: Page; active: boolean; offset: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const items = useMemo(() => page.tiles.map((t) => ({ id: t.id, wide: !!t.preview?.open })), [page.tiles])
  const focused = page.focusedTileId && page.tiles.some((t) => t.id === page.focusedTileId) ? page.focusedTileId : null
  const pad = 14
  const W = Math.max(0, size.w - pad * 2)
  const H = Math.max(0, size.h - pad * 2 - 64)
  const layout = useMemo(() => (focused ? focusLayout(items, focused, W, H) : gridLayout(items, W, H)), [items, focused, W, H])

  return (
    <motion.div
      ref={ref}
      className="absolute inset-0 overflow-y-auto overflow-x-hidden scroll-thin"
      initial={false}
      animate={
        active
          ? { x: 0, opacity: 1, scale: 1, visibility: 'visible', filter: 'blur(0px)' }
          : { x: offset < 0 ? -80 : 80, opacity: 0, scale: 0.97, filter: 'blur(6px)', transitionEnd: { visibility: 'hidden' } }
      }
      transition={spring.gentle}
      style={{ pointerEvents: active ? 'auto' : 'none' }}
    >
      <div className="relative" style={{ height: layout.height + pad * 2 + 64, margin: pad }}>
        <AnimatePresence>
          {page.tiles.map((t) => {
            const r = layout.rects[t.id]
            if (!r) return null
            return <Tile key={t.id} tile={t} rect={r} pageId={page.id} focused={focused === t.id} dimmed={!!focused && focused !== t.id} />
          })}
        </AnimatePresence>
        <AnimatePresence>{!page.tiles.length && size.w > 0 && <EmptyPage />}</AnimatePresence>
      </div>
    </motion.div>
  )
}

function EmptyPage() {
  const { set, projects } = useApp()
  const recent = [...projects].sort((a, b) => b.lastOpened - a.lastOpened)[0]
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={spring.bouncy}
      className="absolute inset-0 grid place-items-center"
    >
      <div className="text-center">
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, 4, -4, 0] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-[28px] bg-gradient-to-br from-violet-400/30 to-sky-400/20 ring-1 ring-white/10"
        >
          <Sparkles className="text-violet-200" size={30} />
        </motion.div>
        <div className="text-[22px] font-semibold tracking-tight">An empty page</div>
        <div className="mt-1.5 mb-6 text-[13.5px] text-white/45">Drop tiles here from another page, or start something new.</div>
        <div className="flex justify-center gap-2">
          <Button tone="primary" onClick={() => set({ newSession: { projectPath: recent?.path } })}>
            <Plus size={15} /> New session <kbd className="ml-1 !bg-white/15 !text-white/80">⌘T</kbd>
          </Button>
          <Button tone="soft" onClick={() => set({ view: 'launcher' })}>
            Open a project
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
