import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { orch } from './orch'
import { shellQuote } from './util'

/**
 * Terminals live outside React. A tile mounting/unmounting (page switch, focus
 * mode, drag to another page) only moves the terminal's DOM node; the xterm
 * instance, its scrollback and the live PTY stream are never torn down.
 */
export interface TermEntry {
  term: Terminal
  fit: FitAddon
  search: SearchAddon
  serialize: SerializeAddon
  el: HTMLDivElement
  opened: boolean
  ready: boolean
  seq: number
  queue: { data: string; seq: number }[]
  webgl?: WebglAddon
  lastCols: number
  lastRows: number
  onFocus?: () => void
}

const entries = new Map<string, TermEntry>()
let linkHandler: (sessionId: string, url: string) => void = (_s, url) => orch.invoke('shell:openExternal', url)
let webglCount = 0
const WEBGL_MAX = 12

export function setLinkHandler(fn: typeof linkHandler) {
  linkHandler = fn
}

const theme = {
  background: '#00000000',
  foreground: '#e6e6f0',
  cursor: '#c4b5fd',
  cursorAccent: '#0b0b12',
  selectionBackground: 'rgba(167, 139, 250, 0.32)',
  black: '#1b1b26',
  red: '#ff6b8a',
  green: '#5af0a6',
  yellow: '#ffd166',
  blue: '#7aa2ff',
  magenta: '#c792ea',
  cyan: '#5ce1e6',
  white: '#d8d8e6',
  brightBlack: '#5c5c78',
  brightRed: '#ff8fa6',
  brightGreen: '#84ffc2',
  brightYellow: '#ffe08a',
  brightBlue: '#a3bdff',
  brightMagenta: '#ddb3ff',
  brightCyan: '#8ff0f3',
  brightWhite: '#ffffff',
}

export function getTerm(sessionId: string): TermEntry {
  let e = entries.get(sessionId)
  if (e) return e
  const term = new Terminal({
    allowProposedApi: true,
    allowTransparency: true,
    fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
    fontSize: 12.5,
    lineHeight: 1.18,
    letterSpacing: 0,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 20000,
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    theme,
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  const serialize = new SerializeAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(serialize)
  term.loadAddon(new Unicode11Addon())
  term.unicode.activeVersion = '11'
  term.loadAddon(new WebLinksAddon((_ev, uri) => linkHandler(sessionId, uri)))

  // Shift+Enter inserts a newline in Claude Code's prompt (what /terminal-setup configures).
  term.attachCustomKeyEventHandler((ev) => {
    if (ev.type === 'keydown' && ev.key === 'Enter' && ev.shiftKey && !ev.metaKey) {
      orch.send('pty:write', sessionId, '\x1b\r')
      return false
    }
    // App shortcuts are handled at the window level.
    if (ev.metaKey && ['k', 't', 'j', 'b', 'w', 'p', 'o', '/', 'Enter', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(ev.key))
      return false
    if (ev.metaKey && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') && ev.altKey) return false
    return true
  })
  term.onData((d) => orch.send('pty:write', sessionId, d))
  term.onBinary((d) => orch.send('pty:write', sessionId, d))

  const el = document.createElement('div')
  el.className = 'h-full w-full'
  el.addEventListener('dragover', (ev) => ev.preventDefault())
  el.addEventListener('drop', (ev) => {
    ev.preventDefault()
    const files = [...(ev.dataTransfer?.files ?? [])].map((f) => shellQuote(orch.pathForFile(f))).filter(Boolean)
    if (files.length) orch.send('pty:write', sessionId, files.join(' ') + ' ')
    term.focus()
  })
  el.addEventListener('focusin', () => entries.get(sessionId)?.onFocus?.())

  e = { term, fit, search, serialize, el, opened: false, ready: false, seq: 0, queue: [], lastCols: 0, lastRows: 0 }
  entries.set(sessionId, e)

  // Replay what the PTY already printed, then go live. Anything that arrived
  // while we waited and is already part of the replay (seq <= replay seq) is dropped.
  const entry = e
  orch.invoke('pty:buffer', sessionId).then(({ data, seq }) => {
    if (data) term.write(data)
    entry.seq = seq
    for (const q of entry.queue) if (q.seq > seq) term.write(q.data)
    entry.queue = []
    entry.ready = true
  })
  return e
}

export function hasTerm(id: string) {
  return entries.has(id)
}

export function onPtyData(id: string, data: string, seq: number) {
  const e = entries.get(id)
  if (!e) return
  if (!e.ready) e.queue.push({ data, seq })
  else if (seq > e.seq) {
    e.seq = seq
    e.term.write(data)
  }
}

export function attach(sessionId: string, host: HTMLElement) {
  const e = getTerm(sessionId)
  if (e.el.parentElement !== host) host.appendChild(e.el)
  if (!e.opened) {
    e.term.open(e.el)
    e.opened = true
    if (webglCount < WEBGL_MAX) {
      try {
        const gl = new WebglAddon()
        gl.onContextLoss(() => {
          gl.dispose()
          webglCount--
          e.webgl = undefined
        })
        e.term.loadAddon(gl)
        e.webgl = gl
        webglCount++
      } catch {
        /* DOM renderer fallback */
      }
    }
  }
  return e
}

export function fitTerm(sessionId: string) {
  const e = entries.get(sessionId)
  if (!e?.opened || !e.el.isConnected || e.el.clientWidth < 20 || e.el.clientHeight < 20) return
  try {
    e.fit.fit()
  } catch {
    return
  }
  const { cols, rows } = e.term
  if (cols !== e.lastCols || rows !== e.lastRows) {
    e.lastCols = cols
    e.lastRows = rows
    orch.send('pty:resize', sessionId, cols, rows)
  }
}

export function disposeTerm(sessionId: string) {
  const e = entries.get(sessionId)
  if (!e) return
  if (e.webgl) webglCount--
  e.term.dispose()
  e.el.remove()
  entries.delete(sessionId)
}

/** Last N visible lines, for overview thumbnails and scrollback search */
export function snapshot(sessionId: string, lines = 14): string[] {
  const e = entries.get(sessionId)
  if (!e) return []
  const buf = e.term.buffer.active
  const out: string[] = []
  const end = buf.baseY + e.term.rows
  for (let i = Math.max(0, end - lines); i < end; i++) out.push(buf.getLine(i)?.translateToString(true) ?? '')
  while (out.length && !out[out.length - 1].trim()) out.pop()
  return out
}

export function searchAll(q: string, limit = 30): { sessionId: string; line: string; row: number }[] {
  const out: { sessionId: string; line: string; row: number }[] = []
  if (q.length < 2) return out
  const needle = q.toLowerCase()
  for (const [id, e] of entries) {
    const buf = e.term.buffer.active
    for (let i = buf.length - 1; i >= 0 && out.length < limit; i--) {
      const line = buf.getLine(i)?.translateToString(true) ?? ''
      if (line.toLowerCase().includes(needle)) out.push({ sessionId: id, line: line.trim(), row: i })
    }
  }
  return out
}

export function focusTerm(sessionId: string) {
  entries.get(sessionId)?.term.focus()
}

export function setFocusHandler(sessionId: string, fn: () => void) {
  getTerm(sessionId).onFocus = fn
}

/** Type a prompt into a Claude session and submit it */
export function submitPrompt(sessionId: string, text: string) {
  orch.send('pty:write', sessionId, `\x1b[200~${text}\x1b[201~`)
  setTimeout(() => orch.send('pty:write', sessionId, '\r'), 120)
}
