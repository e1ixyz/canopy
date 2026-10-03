import { useEffect, useRef } from 'react'
import { attach, fitTerm, setFocusHandler } from '../lib/terms'
import { useApp } from '../store/app'

/**
 * Hosts a persistent xterm. Fitting is debounced so the PTY is resized once a
 * layout spring settles, not on every animation frame.
 */
export function TerminalView({ sessionId, tileId, visible }: { sessionId: string; tileId?: string; visible: boolean }) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    attach(sessionId, el)
    if (tileId) setFocusHandler(sessionId, () => useApp.getState().setActiveTile(tileId))
    let t: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver(() => {
      if (t) clearTimeout(t)
      t = setTimeout(() => fitTerm(sessionId), 90)
    })
    ro.observe(el)
    requestAnimationFrame(() => fitTerm(sessionId))
    return () => {
      ro.disconnect()
      if (t) clearTimeout(t)
    }
  }, [sessionId, tileId])

  useEffect(() => {
    if (visible) requestAnimationFrame(() => fitTerm(sessionId))
  }, [visible, sessionId])

  return <div ref={host} className="absolute inset-0 overflow-hidden py-1.5 pr-0.5 pl-2.5" />
}
