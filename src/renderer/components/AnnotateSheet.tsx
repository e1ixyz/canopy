import { ArrowUpRight, Eraser, PenLine, Save, Send, Square, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { orch } from '../lib/orch'
import { cx, shellQuote } from '../lib/util'
import { useApp } from '../store/app'
import { Button, Modal } from './ui'

type Tool = 'pen' | 'arrow' | 'box'
type Pt = { x: number; y: number }
type Mark = { tool: Tool; color: string; pts: Pt[] }

const COLORS = ['#f43f5e', '#facc15', '#22d3ee']

/** Mark up a capture with a pen, arrows and boxes, then hand the PNG's path to a session */
export function AnnotateSheet() {
  const { annotate, set } = useApp()
  return (
    <Modal open={!!annotate} onClose={() => set({ annotate: null })} width={1100} align="top">
      {annotate && <Body key={annotate.image.length + annotate.sessionId} shot={annotate} />}
    </Modal>
  )
}

function draw(ctx: CanvasRenderingContext2D, m: Mark, scale: number) {
  ctx.strokeStyle = m.color
  ctx.fillStyle = m.color
  ctx.lineWidth = 4 * scale
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const [a, b] = [m.pts[0], m.pts[m.pts.length - 1]]
  if (!a) return
  if (m.tool === 'pen') {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    for (const p of m.pts) ctx.lineTo(p.x, p.y)
    ctx.stroke()
  } else if (m.tool === 'box') {
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
  } else {
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    const len = 18 * scale
    ctx.beginPath()
    ctx.moveTo(b.x, b.y)
    ctx.lineTo(b.x - len * Math.cos(ang - 0.45), b.y - len * Math.sin(ang - 0.45))
    ctx.lineTo(b.x - len * Math.cos(ang + 0.45), b.y - len * Math.sin(ang + 0.45))
    ctx.closePath()
    ctx.fill()
  }
}

function Body({ shot }: { shot: { sessionId: string; image: string; label: string } }) {
  const { set, toast, sessions } = useApp()
  const canvas = useRef<HTMLCanvasElement>(null)
  const img = useRef<HTMLImageElement | null>(null)
  const [tool, setTool] = useState<Tool>('arrow')
  const [color, setColor] = useState(COLORS[0])
  const [marks, setMarks] = useState<Mark[]>([])
  const live = useRef<Mark | null>(null)
  const [busy, setBusy] = useState(false)
  const target = sessions[shot.sessionId]

  // Captures are device pixels; scale stroke widths so they look the same at any size.
  const scale = () => (canvas.current ? canvas.current.width / Math.max(1, canvas.current.clientWidth) : 1)

  const redraw = (extra?: Mark | null) => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx || !img.current) return
    // Pages without a background capture as transparent; paint what the preview showed under them.
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--webview-bg').trim() || '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img.current, 0, 0, c.width, c.height)
    for (const m of extra ? [...marks, extra] : marks) draw(ctx, m, scale())
  }

  useEffect(() => {
    const i = new Image()
    i.onload = () => {
      img.current = i
      if (canvas.current) {
        canvas.current.width = i.naturalWidth
        canvas.current.height = i.naturalHeight
      }
      redraw()
    }
    i.src = shot.image
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot.image])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => redraw(), [marks])

  const at = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * canvas.current!.width, y: ((e.clientY - r.top) / r.height) * canvas.current!.height }
  }

  const finish = async (paste: boolean) => {
    if (!canvas.current) return
    setBusy(true)
    try {
      const file = await orch.invoke('shot:save', canvas.current.toDataURL('image/png'), shot.label)
      if (paste && target) {
        orch.send('pty:write', target.id, shellQuote(file) + ' ')
        toast(`Annotated screenshot pasted into ${target.name}'s prompt`, 'ok')
      } else toast(`Saved ${file.split('/').pop()}`, 'ok')
      set({ annotate: null })
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const toolBtn = (t: Tool, icon: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onClick={() => setTool(t)}
      className={cx('no-drag grid h-8 w-8 place-items-center rounded-lg transition', tool === t ? 'bg-white/15 text-white' : 'text-white/50 hover:bg-white/[0.07] hover:text-white')}
    >
      {icon}
    </button>
  )

  return (
    <div className="flex max-h-[82vh] flex-col">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3">
        <div className="mr-2 text-[14px] font-semibold tracking-tight">Mark up</div>
        {toolBtn('arrow', <ArrowUpRight size={15} />, 'Arrow')}
        {toolBtn('box', <Square size={14} />, 'Box')}
        {toolBtn('pen', <PenLine size={14} />, 'Pen')}
        <div className="mx-2 h-5 w-px bg-white/10" />
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => setColor(c)}
            className={cx('no-drag h-5 w-5 rounded-full ring-offset-2 ring-offset-[var(--glass)] transition', color === c && 'ring-2 ring-white/70')}
            style={{ background: c }}
          />
        ))}
        <div className="mx-2 h-5 w-px bg-white/10" />
        <button type="button" title="Undo (⌘Z)" onClick={() => setMarks((m) => m.slice(0, -1))} disabled={!marks.length} className="no-drag grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white disabled:opacity-30">
          <Undo2 size={14} />
        </button>
        <button type="button" title="Clear" onClick={() => setMarks([])} disabled={!marks.length} className="no-drag grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white disabled:opacity-30">
          <Eraser size={14} />
        </button>
        <div className="flex-1" />
        <Button size="sm" onClick={() => finish(false)} disabled={busy}>
          <Save size={12} /> Save only
        </Button>
        <Button size="sm" tone="primary" onClick={() => finish(true)} disabled={busy || !target}>
          <Send size={12} /> Send to {target?.name ?? 'session'}
        </Button>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto bg-black/40 p-4"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'z') setMarks((m) => m.slice(0, -1))
        }}
        tabIndex={-1}
      >
        <canvas
          ref={canvas}
          className="mx-auto block max-w-full cursor-crosshair rounded-lg shadow-2xl"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            live.current = { tool, color, pts: [at(e)] }
          }}
          onPointerMove={(e) => {
            const m = live.current
            if (!m) return
            const p = at(e)
            m.pts = m.tool === 'pen' ? [...m.pts, p] : [m.pts[0], p]
            redraw(m)
          }}
          onPointerUp={() => {
            const m = live.current
            live.current = null
            if (m && m.pts.length > 1) setMarks((cur) => [...cur, m])
          }}
        />
      </div>
    </div>
  )
}
