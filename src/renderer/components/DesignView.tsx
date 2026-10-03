import { ArrowLeft, Columns2, ExternalLink, Layers, Palette, PenLine, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Session } from '@shared/types'
import { orch } from '../lib/orch'
import { cx } from '../lib/util'
import { useApp } from '../store/app'
import type { WebviewEl } from './PreviewPane'
import { Button, Field, IconButton, inputCls, Modal, Segmented } from './ui'

/**
 * A design (claude.ai artifact, Figma, any URL) beside the session building it. One shared
 * partition keeps your logins. Compare lays the paired session's live preview over it.
 */
export function DesignView({ s }: { s: Session }) {
  const target = s.target?.kind === 'design' ? s.target : null
  const view = useRef<WebviewEl | null>(null)
  const [url, setUrl] = useState(target?.url ?? '')
  const [initial] = useState(target?.url ?? 'about:blank')
  const [overlay, setOverlay] = useState<string | null>(null)
  const [mode, setMode] = useState<'onion' | 'side'>('onion')
  const [opacity, setOpacity] = useState(0.5)
  const { toast, set } = useApp()
  const paired = useApp((st) => (target?.pairedWith ? st.sessions[target.pairedWith] : undefined))
  const pairedWc = useApp((st) => (target?.pairedWith ? st.previewWc[target.pairedWith] : undefined))

  useEffect(() => {
    const w = view.current
    if (!w) return
    const onNav = (e: Event) => {
      const u = (e as Event & { url: string }).url
      setUrl(u)
      if (target && u !== target.url && !u.startsWith('about:')) orch.invoke('session:retarget', s.id, { ...target, url: u })
    }
    w.addEventListener('did-navigate', onNav)
    return () => w.removeEventListener('did-navigate', onNav)
  }, [s.id, target])

  if (!target) return null

  const go = (raw: string) => {
    let u = raw.trim()
    if (!u) return
    if (!/^[a-z]+:/.test(u)) u = `https://${u}`
    view.current?.loadURL(u).catch(() => {})
  }

  const compare = async () => {
    if (overlay) return setOverlay(null)
    if (!pairedWc) return toast(paired ? `Open ${paired.name}'s preview first` : 'This design is not paired with a session', 'warn')
    try {
      setOverlay(await orch.invoke('preview:capture', pairedWc))
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onMouseDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1 border-b border-white/[0.06] px-2 py-1.5">
        <IconButton title="Back" onClick={() => view.current?.goBack()}>
          <ArrowLeft size={13} />
        </IconButton>
        <IconButton title="Reload" onClick={() => view.current?.reload()}>
          <RotateCw size={13} />
        </IconButton>
        <form
          className="min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go(url)
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="no-drag h-7 w-full rounded-lg bg-black/30 px-2.5 font-mono text-[11.5px] text-white/80 outline-none focus:ring-1 focus:ring-violet-400/40" />
        </form>
        <IconButton title={overlay ? 'Hide the preview overlay' : `Compare with ${paired?.name ?? 'the paired session'}'s live preview`} active={!!overlay} onClick={compare}>
          <Layers size={13} />
        </IconButton>
        <IconButton title="Open in browser" onClick={() => orch.invoke('shell:openExternal', url)}>
          <ExternalLink size={13} />
        </IconButton>
      </div>
      {overlay && (
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11.5px] text-white/60">
          <Segmented
            id={`design-mode-${s.id}`}
            value={mode}
            onChange={setMode}
            options={[
              { value: 'onion', label: <span className="flex items-center gap-1"><Layers size={11} /> Overlay</span> },
              { value: 'side', label: <span className="flex items-center gap-1"><Columns2 size={11} /> Side by side</span> },
            ]}
          />
          {mode === 'onion' && (
            <label className="flex items-center gap-2">
              Preview
              <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="no-drag w-32 accent-violet-400" />
              {Math.round(opacity * 100)}%
            </label>
          )}
          <div className="flex-1" />
          {paired && (
            <Button size="sm" tone="soft" onClick={() => set({ annotate: { sessionId: paired.id, image: overlay, label: `${paired.name}-vs-design` } })}>
              <PenLine size={12} /> Mark up for {paired.name}
            </Button>
          )}
          <IconButton title="Close compare" onClick={() => setOverlay(null)}>
            <X size={13} />
          </IconButton>
        </div>
      )}
      <div className={cx('relative min-h-0 flex-1', overlay && mode === 'side' && 'flex')}>
        <div className={overlay && mode === 'side' ? 'relative w-1/2 border-r border-white/10' : 'absolute inset-0'}>
          <webview ref={view as never} src={initial} partition="persist:design" className="absolute inset-0" {...({ allowpopups: 'true' } as object)} />
        </div>
        {overlay && mode === 'onion' && (
          // Drawn at CSS pixel size from the top left, so it lines up with the page under it.
          <img
            src={overlay}
            alt=""
            onLoad={(e) => (e.currentTarget.style.width = `${e.currentTarget.naturalWidth / window.devicePixelRatio}px`)}
            className="pointer-events-none absolute top-0 left-0 max-w-none"
            style={{ opacity }}
          />
        )}
        {overlay && mode === 'side' && (
          <div className="w-1/2 overflow-auto bg-white">
            <img src={overlay} alt="" className="block w-full" />
          </div>
        )}
      </div>
    </div>
  )
}

/** Ask for a design URL and open it in a tile beside the session */
export function DesignSheet() {
  const { designFor, set } = useApp()
  return (
    <Modal open={!!designFor} onClose={() => set({ designFor: null })} width={520}>
      {designFor && <SheetBody sessionId={designFor} />}
    </Modal>
  )
}

function SheetBody({ sessionId }: { sessionId: string }) {
  const { sessions, projects, set, addTileAfter, toast } = useApp()
  const s = sessions[sessionId]
  const [url, setUrl] = useState('')
  const open = async () => {
    let u = url.trim()
    if (!u) return
    if (!/^[a-z]+:/.test(u)) u = `https://${u}`
    const projectPath = projects.find((p) => p.id === s?.projectId)?.path ?? s?.cwd ?? orch.homedir
    try {
      const d = await orch.invoke('session:spawn', { kind: 'design', projectPath, cwd: s?.cwd ?? orch.homedir, target: { kind: 'design', url: u, pairedWith: s?.id } })
      useApp.setState((st) => ({ sessions: { ...st.sessions, [d.id]: d } }))
      addTileAfter(d.id, s?.id)
      set({ designFor: null })
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-2.5">
        <Palette size={16} className="text-fuchsia-300" />
        <div className="text-[16px] font-semibold tracking-tight">Open a design beside {s?.name ?? 'this session'}</div>
      </div>
      <Field label="URL">
        <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && open()} placeholder="https://claude.ai/artifact/…  or  https://www.figma.com/design/…" className={inputCls} />
      </Field>
      <div className="text-[11.5px] leading-relaxed text-white/40">
        Design tiles share one browser profile, so you sign in to claude.ai or Figma once. Compare lays {s?.name ?? 'the session'}’s live preview over the design.
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={() => set({ designFor: null })}>Cancel</Button>
        <Button tone="primary" disabled={!url.trim()} onClick={open}>
          Open
        </Button>
      </div>
    </div>
  )
}
