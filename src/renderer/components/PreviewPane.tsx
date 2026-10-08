import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  Camera,
  ExternalLink,
  Images,
  Moon,
  Monitor,
  Play,
  RotateCw,
  ScrollText,
  Smartphone,
  Sun,
  Tablet,
  Wand2,
  X,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PreviewState, Session, Tile } from '@shared/types'
import { spring } from '../lib/motion'
import { orch } from '../lib/orch'
import { askPrompt } from '../lib/prompts'
import { cx, hashStr, shellQuote } from '../lib/util'
import { useApp } from '../store/app'
import { TerminalView } from './TerminalView'
import { IconButton } from './ui'

export type WebviewEl = HTMLElement & {
  loadURL: (u: string) => Promise<void>
  getURL: () => string
  goBack: () => void
  goForward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  reload: () => void
  openDevTools: () => void
  isDevToolsOpened: () => boolean
  closeDevTools: () => void
  getWebContentsId: () => number
}

const WIDTHS: { value: PreviewState['width']; icon: React.ReactNode; label: string }[] = [
  { value: 'fill', icon: <Monitor size={13} />, label: 'Fill' },
  { value: 1440, icon: <Monitor size={13} />, label: '1440' },
  { value: 768, icon: <Tablet size={13} />, label: '768' },
  { value: 390, icon: <Smartphone size={13} />, label: '390' },
]

export function PreviewPane({
  tile,
  session,
  ports,
  projectPath,
  devSession,
}: {
  tile: Tile
  session: Session
  ports: number[]
  pageId: string
  projectPath: string
  devSession?: Session
}) {
  const { setPreview, toast } = useApp()
  const preview = tile.preview!
  const view = useRef<WebviewEl | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const [initialSrc] = useState(() => preview.url || (ports[0] ? `http://localhost:${ports[0]}` : 'about:blank'))
  const [url, setUrl] = useState(preview.url)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [scheme, setScheme] = useState<'dark' | 'light' | null>(null)
  const [frameW, setFrameW] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [logs, setLogs] = useState(false)
  const [devError, setDevError] = useState<string | null>(null)
  const ready = useRef(false)

  // Each worktree gets its own cookie jar, so logins never collide across worktrees.
  const partition = `persist:wt-${hashStr(session.cwd)}`

  useEffect(() => {
    const w = view.current
    if (!w) return
    const onNav = () => {
      const u = w.getURL()
      setUrl(u)
      setFailed(null)
      setPreview(tile.id, { url: u })
    }
    const onReady = () => {
      ready.current = true
      const id = w.getWebContentsId()
      orch.invoke('preview:register', session.id, session.cwd, id)
      useApp.setState((st) => ({ previewWc: { ...st.previewWc, [session.id]: id } }))
    }
    const onFail = (e: Event & { errorDescription?: string; errorCode?: number; isMainFrame?: boolean }) => {
      if (e.isMainFrame === false || e.errorCode === -3) return
      setFailed(e.errorDescription || 'Failed to load')
    }
    const onTitle = (e: Event & { title?: string }) => setTitle(e.title ?? '')
    const onStart = () => setLoading(true)
    const onStop = () => setLoading(false)
    w.addEventListener('dom-ready', onReady)
    w.addEventListener('did-navigate', onNav)
    w.addEventListener('did-navigate-in-page', onNav)
    w.addEventListener('did-fail-load', onFail as EventListener)
    w.addEventListener('page-title-updated', onTitle as EventListener)
    w.addEventListener('did-start-loading', onStart)
    w.addEventListener('did-stop-loading', onStop)
    return () => {
      try {
        orch.invoke('preview:unregister', session.id, w.getWebContentsId())
      } catch {
        /* never got ready */
      }
      // The webContents dies with this webview; screenshot sets and Compare must not reach for it.
      useApp.setState((st) => {
        const { [session.id]: _gone, ...rest } = st.previewWc
        return { previewWc: rest }
      })
      w.removeEventListener('dom-ready', onReady)
      w.removeEventListener('did-navigate', onNav)
      w.removeEventListener('did-navigate-in-page', onNav)
      w.removeEventListener('did-fail-load', onFail as EventListener)
      w.removeEventListener('page-title-updated', onTitle as EventListener)
      w.removeEventListener('did-start-loading', onStart)
      w.removeEventListener('did-stop-loading', onStop)
    }
  }, [tile.id, setPreview, session.id, session.cwd])

  // Navigate when something outside (open_preview, a clicked link) changes the URL.
  useEffect(() => {
    const w = view.current
    if (!w || !ready.current || !preview.url) return
    if (preview.url !== w.getURL()) w.loadURL(preview.url).catch(() => {})
  }, [preview.url])

  // A dev server that comes up after the pane opened: load it.
  useEffect(() => {
    const w = view.current
    if (!w || !ready.current || !ports.length) return
    const cur = w.getURL()
    if (cur === 'about:blank' || failed) go(`http://localhost:${ports[0]}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ports.join(',')])

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const go = (raw: string) => {
    let u = raw.trim()
    if (!u) return
    if (/^\d+$/.test(u)) u = `http://localhost:${u}`
    else if (/^:\d+/.test(u)) u = `http://localhost${u}`
    else if (!/^[a-z]+:/.test(u)) u = `http://${u}`
    setUrl(u)
    setFailed(null)
    setPreview(tile.id, { url: u })
    view.current?.loadURL(u).catch(() => {})
  }

  const markUp = async () => {
    const w = view.current
    if (!w) return
    try {
      const image = await orch.invoke('preview:capture', w.getWebContentsId())
      useApp.getState().set({ annotate: { sessionId: session.id, image, label: session.name } })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const shot = async (toSession: boolean) => {
    const w = view.current
    if (!w) return
    try {
      const file = await orch.invoke('preview:shot', w.getWebContentsId(), `${session.name}`)
      if (toSession) {
        orch.send('pty:write', session.id, shellQuote(file) + ' ')
        toast('Screenshot path pasted into the prompt', 'ok')
      } else toast(`Saved to ${file.replace(orch.homedir, '~')}`, 'ok')
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const toggleScheme = () => {
    const next = scheme === null ? 'dark' : scheme === 'dark' ? 'light' : null
    setScheme(next)
    const w = view.current
    if (w) orch.invoke('preview:emulate', w.getWebContentsId(), next).catch(() => {})
  }

  const startDev = async () => {
    try {
      setDevError(null)
      await orch.invoke('dev:start', session.cwd, projectPath)
      setLogs(true)
      toast('Dev server starting…', 'ok')
    } catch (e) {
      setDevError((e as Error).message)
    }
  }

  // Start failed or the server died: offer to have Claude make it runnable in the repo.
  const crashed = devSession?.status === 'exited' && !!devSession.exitCode && !ports.length
  const setupReason = devError ?? (crashed ? `the dev server (${devSession?.command ?? 'dev command'}) exited with code ${devSession?.exitCode}` : null)
  const setUp = () => {
    if (!setupReason) return
    askPrompt(session.id, 'devSetup', { error: setupReason, root: projectPath })
    setDevError(null)
    toast('Asked Claude to set up the dev server', 'ok')
  }

  const fixed = preview.width === 'fill' ? null : preview.width
  const scale = fixed && frameW && frameW < fixed ? frameW / fixed : 1

  const onDividerDown = (e: React.PointerEvent) => {
    const body = (e.currentTarget as HTMLElement).parentElement?.parentElement
    if (!body) return
    const rect = body.getBoundingClientRect()
    setDragging(true)
    const move = (ev: PointerEvent) => {
      const split = Math.min(0.8, Math.max(0.2, (ev.clientX - rect.left) / rect.width))
      setPreview(tile.id, { split })
    }
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 40, flexGrow: 0 }}
      animate={{ opacity: 1, x: 0, flexGrow: 1 }}
      exit={{ opacity: 0, x: 40, flexGrow: 0, transition: { duration: 0.2 } }}
      transition={spring.layout}
      className="relative flex min-w-0 flex-1 flex-col border-l border-white/[0.06] bg-black/20"
    >
      <div
        onPointerDown={onDividerDown}
        className="group absolute top-0 bottom-0 -left-1.5 z-20 w-3 cursor-col-resize"
        title="Drag to resize"
      >
        <div className="mx-auto h-full w-px bg-transparent transition group-hover:bg-violet-400/60" />
      </div>

      {/* toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-white/[0.05] px-1.5">
        <IconButton title="Back" onClick={() => view.current?.goBack()}>
          <ArrowLeft size={13} />
        </IconButton>
        <IconButton title="Forward" onClick={() => view.current?.goForward()}>
          <ArrowRight size={13} />
        </IconButton>
        <IconButton title="Reload" onClick={() => view.current?.reload()}>
          <RotateCw size={13} className={loading ? 'animate-spin' : ''} />
        </IconButton>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go(url)
          }}
        >
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onFocus={(e) => e.target.select()}
            title={title}
            placeholder="localhost:5173"
            className="no-drag h-6 w-full rounded-lg border border-white/[0.06] bg-black/30 px-2 font-mono text-[11px] text-white/80 outline-none focus:border-violet-400/40"
          />
        </form>
        {ports.slice(0, 4).map((p) => (
          <button
            key={p}
            onClick={() => go(`http://localhost:${p}`)}
            className={cx(
              'no-drag rounded-md px-1.5 py-0.5 font-mono text-[10.5px] transition',
              url.includes(`:${p}`) ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/[0.05] text-white/50 hover:text-white',
            )}
          >
            :{p}
          </button>
        ))}
        <div className="mx-0.5 flex rounded-lg bg-white/[0.04]">
          {WIDTHS.map((w) => (
            <button
              key={String(w.value)}
              title={w.label}
              onClick={() => setPreview(tile.id, { width: w.value })}
              className={cx(
                'no-drag grid h-6 place-items-center rounded-lg px-1.5 text-[10px] transition',
                preview.width === w.value ? 'bg-white/[0.12] text-white' : 'text-white/45 hover:text-white',
              )}
            >
              {w.value === 'fill' ? w.icon : w.label}
            </button>
          ))}
        </div>
        <IconButton title={`Color scheme: ${scheme ?? 'page default'}`} onClick={toggleScheme} active={scheme !== null}>
          {scheme === 'light' ? <Sun size={13} /> : <Moon size={13} />}
        </IconButton>
        <IconButton
          title="Screenshot and mark it up (⌥-click: just save it, ⇧-click: save and paste the path)"
          onClick={(e) => (e.altKey || e.shiftKey ? shot(e.shiftKey) : markUp())}
        >
          <Camera size={13} />
        </IconButton>
        <IconButton title="Screenshot set: numbered full-page captures of several routes" onClick={() => useApp.getState().set({ shotSet: { sessionId: session.id, tileId: tile.id } })}>
          <Images size={13} />
        </IconButton>
        <IconButton
          title="DevTools"
          onClick={() => {
            const w = view.current
            if (!w) return
            if (w.isDevToolsOpened()) w.closeDevTools()
            else w.openDevTools()
          }}
        >
          <Bug size={13} />
        </IconButton>
        {devSession && (
          <IconButton title="Dev server logs" active={logs} onClick={() => setLogs((l) => !l)}>
            <ScrollText size={13} />
          </IconButton>
        )}
        <IconButton title="Open in browser" onClick={() => url && orch.invoke('shell:openExternal', url)}>
          <ExternalLink size={13} />
        </IconButton>
        <IconButton title="Close preview" onClick={() => setPreview(tile.id, { open: false })}>
          <X size={13} />
        </IconButton>
      </div>

      {/* page */}
      <div ref={frame} className="relative min-h-0 flex-1 overflow-hidden">
        <div
          className={cx('absolute top-0 left-1/2 origin-top', !!fixed && 'shadow-[0_0_0_1px_var(--hairline-strong)]')}
          style={{
            width: fixed ?? '100%',
            height: `${100 / scale}%`,
            transform: `translateX(-50%) scale(${scale})`,
          }}
        >
          <webview ref={view as never} src={initialSrc} partition={partition} {...({ allowpopups: 'true' } as object)} />
        </div>
        {dragging && <div className="absolute inset-0 z-10 cursor-col-resize" />}
        <AnimatePresence>
          {(failed || setupReason || (!ports.length && (!url || url === 'about:blank'))) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={spring.bouncy}
              className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,var(--tile-bg)_92%,transparent)] backdrop-blur"
            >
              <div className="max-w-xs text-center">
                <div className="mb-1 text-[14px] font-semibold text-white/85">
                  {setupReason ? 'The dev server didn’t start' : failed ? 'Nothing answered there' : 'No dev server yet'}
                </div>
                <div className="mb-4 text-[12px] text-white/45">
                  {setupReason ?? failed ?? 'Start one for this worktree; the preview loads as soon as it listens.'}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {setupReason && session.kind === 'claude' && (
                    <button
                      onClick={setUp}
                      title="Claude installs what's missing and adds a devCommand to .orchestrator.json"
                      className="no-drag inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-[12.5px] font-semibold text-black shadow-lg"
                    >
                      <Wand2 size={13} /> Set up with Claude
                    </button>
                  )}
                  <button
                    onClick={startDev}
                    className={cx(
                      'no-drag inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold',
                      setupReason && session.kind === 'claude' ? 'bg-white/[0.08] text-white/80 hover:bg-white/[0.12]' : 'bg-emerald-500 text-black shadow-lg',
                    )}
                  >
                    <Play size={13} /> {setupReason ? 'Try again' : 'Start dev server'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {logs && devSession && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: '38%', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.layout}
            className="relative shrink-0 border-t border-white/[0.08] bg-black/50"
          >
            <div className="absolute top-1 right-2 z-10 font-mono text-[10px] text-white/35">{devSession.name} · {devSession.status}</div>
            <TerminalView sessionId={devSession.id} visible={logs} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
