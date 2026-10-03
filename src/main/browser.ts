import { nativeImage, webContents, type WebContents } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveRoute, shotFileName } from './shots'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function cdp(wc: WebContents, method: string, params?: Record<string, unknown>) {
  if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
  return wc.debugger.sendCommand(method, params)
}

async function load(wc: WebContents, url: string, settle = 700) {
  const done = new Promise<void>((resolve) => {
    const t = setTimeout(resolve, 20_000)
    wc.once('did-stop-loading', () => {
      clearTimeout(t)
      resolve()
    })
  })
  wc.loadURL(url).catch(() => {})
  await done
  await sleep(settle)
}

async function fullPagePng(wc: WebContents, width?: number): Promise<Buffer> {
  const m = (await cdp(wc, 'Page.getLayoutMetrics')) as { cssContentSize?: { width: number; height: number }; contentSize: { width: number; height: number } }
  const size = m.cssContentSize ?? m.contentSize
  const w = width ?? Math.ceil(size.width)
  const h = Math.min(Math.ceil(size.height), 16_000)
  const shot = (await cdp(wc, 'Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: w, height: h, scale: 1 },
  })) as { data: string }
  return Buffer.from(shot.data, 'base64')
}

interface Entry {
  wcId: number
  cwd: string
}

/** Lets sessions (and the screenshot-set feature) drive the preview webview next to their terminal */
export class BrowserBridge {
  private bySession = new Map<string, Entry>()
  private consoleLog = new Map<number, string[]>()
  private hooked = new Set<number>()

  register(sessionId: string, cwd: string, wcId: number) {
    this.bySession.set(sessionId, { wcId, cwd })
    const wc = webContents.fromId(wcId)
    if (wc && !this.hooked.has(wcId)) {
      this.hooked.add(wcId)
      wc.on('console-message', (e) => {
        const list = this.consoleLog.get(wcId) ?? []
        list.push(`[${e.level}] ${e.message}`)
        if (list.length > 200) list.splice(0, list.length - 200)
        this.consoleLog.set(wcId, list)
      })
      wc.once('destroyed', () => {
        this.hooked.delete(wcId)
        this.consoleLog.delete(wcId)
      })
    }
  }

  unregister(sessionId: string, wcId: number) {
    if (this.bySession.get(sessionId)?.wcId === wcId) this.bySession.delete(sessionId)
  }

  find(sessionId: string, cwd: string): WebContents | null {
    const own = this.bySession.get(sessionId)
    const pick = (e?: Entry) => {
      const wc = e ? webContents.fromId(e.wcId) : undefined
      return wc && !wc.isDestroyed() ? wc : null
    }
    const mine = pick(own)
    if (mine) return mine
    for (const e of this.bySession.values()) if (e.cwd === cwd && pick(e)) return pick(e)
    return null
  }

  async ensure(sessionId: string, cwd: string, open: () => void, timeout = 8000): Promise<WebContents> {
    let wc = this.find(sessionId, cwd)
    if (wc) return wc
    open()
    const until = Date.now() + timeout
    while (Date.now() < until) {
      await sleep(200)
      wc = this.find(sessionId, cwd)
      if (wc) return wc
    }
    throw new Error('No preview is open for this session and none came up in time.')
  }

  navigate(wc: WebContents, url: string) {
    return load(wc, url, 400)
  }

  /** Visible interactive elements tagged with refs (eN), plus a text outline */
  async snapshot(wc: WebContents): Promise<string> {
    return wc.executeJavaScript(`(() => {
      const sel = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=menuitem],[role=option],[contenteditable=true]';
      let n = 0; const lines = [];
      document.querySelectorAll('[data-orch-ref]').forEach(el => { const k = Number(el.getAttribute('data-orch-ref').slice(1)); if (k > n) n = k; });
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
        let ref = el.getAttribute('data-orch-ref'); if (!ref) { ref = 'e' + (++n); el.setAttribute('data-orch-ref', ref); }
        const tag = el.tagName.toLowerCase(); const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag);
        const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
        const extra = tag === 'input' ? ' type=' + (el.type || 'text') + (el.value ? ' value="' + String(el.value).slice(0, 40) + '"' : '') : '';
        lines.push('[' + ref + '] ' + role + ' "' + name + '"' + extra + (el.disabled ? ' (disabled)' : ''));
      }
      const heads = [...document.querySelectorAll('h1,h2,h3')].slice(0, 20).map(h => h.tagName.toLowerCase() + ': ' + h.innerText.trim().slice(0, 80));
      const text = (document.body?.innerText || '').replace(/\\n{3,}/g, '\\n\\n').slice(0, 3000);
      return ('URL: ' + location.href + '\\nTitle: ' + document.title + '\\n\\nHeadings:\\n' + heads.join('\\n') + '\\n\\nInteractive (use ref with browser_click / browser_type):\\n' + lines.join('\\n') + '\\n\\nText:\\n' + text).slice(0, 9000);
    })()`)
  }

  private async locate(wc: WebContents, target: string): Promise<{ x: number; y: number }> {
    const sel = /^e\d+$/.test(target) ? `[data-orch-ref="${target}"]` : target
    const r = await wc.executeJavaScript(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    })()`)
    if (!r) throw new Error(`Nothing matches ${target}. Take a fresh browser_snapshot; refs change when the page re-renders.`)
    return r
  }

  async click(wc: WebContents, target: string) {
    const { x, y } = await this.locate(wc, target)
    await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
    await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await cdp(wc, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
    await sleep(350)
  }

  async type(wc: WebContents, target: string, text: string, submit: boolean) {
    await this.click(wc, target)
    const sel = /^e\d+$/.test(target) ? `[data-orch-ref="${target}"]` : target
    await wc.executeJavaScript(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el && 'select' in el) el.select(); })()`)
    await cdp(wc, 'Input.insertText', { text })
    if (submit) {
      const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }
      await cdp(wc, 'Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...key })
      await cdp(wc, 'Input.dispatchKeyEvent', { type: 'keyUp', ...key })
    }
    await sleep(300)
  }

  async evaluate(wc: WebContents, js: string): Promise<string> {
    let out: unknown
    try {
      out = await wc.executeJavaScript(`(async () => (${js}))()`)
    } catch {
      out = await wc.executeJavaScript(`(async () => { ${js} })()`)
    }
    const s = typeof out === 'string' ? out : JSON.stringify(out, null, 2)
    return (s ?? 'undefined').slice(0, 20_000)
  }

  async screenshot(wc: WebContents, label: string, fullPage: boolean) {
    const png = fullPage ? await fullPagePng(wc) : (await wc.capturePage()).toPNG()
    const dir = join(homedir(), 'Desktop', `${label.replace(/[^\w.-]+/g, '-')}-shots`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`)
    writeFileSync(file, png)
    let img = nativeImage.createFromBuffer(png)
    if (img.getSize().width > 1280) img = img.resize({ width: 1280 })
    return { file, jpeg: img.toJPEG(78).toString('base64') }
  }

  console(wc: WebContents, clear: boolean) {
    const list = this.consoleLog.get(wc.id) ?? []
    const out = list.join('\n') || '(no console output yet)'
    if (clear) this.consoleLog.set(wc.id, [])
    return out.slice(-15_000)
  }

  async waitFor(wc: WebContents, text?: string, ms?: number) {
    if (!text) {
      await sleep(Math.min(ms ?? 1000, 30_000))
      return 'waited'
    }
    const until = Date.now() + Math.min(ms ?? 15_000, 60_000)
    while (Date.now() < until) {
      const hit = await wc.executeJavaScript(`(document.body?.innerText || '').includes(${JSON.stringify(text)})`)
      if (hit) return `found "${text}"`
      await sleep(250)
    }
    throw new Error(`"${text}" did not appear in time`)
  }

  /** Numbered full-page captures of a list of routes at one width */
  async shotSet(
    wcId: number,
    opts: { base: string; routes: string[]; width: number; scheme: 'light' | 'dark'; folder: string },
    progress: (i: number, n: number, file: string) => void,
  ) {
    const wc = webContents.fromId(wcId)
    if (!wc || wc.isDestroyed()) throw new Error('The preview closed')
    const back = wc.getURL()
    mkdirSync(opts.folder, { recursive: true })
    const files: string[] = []
    await cdp(wc, 'Emulation.setDeviceMetricsOverride', { width: opts.width, height: 900, deviceScaleFactor: 1, mobile: opts.width < 500 })
    await cdp(wc, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opts.scheme }] })
    try {
      for (let i = 0; i < opts.routes.length; i++) {
        await load(wc, resolveRoute(opts.base, opts.routes[i]))
        const file = join(opts.folder, shotFileName(i, opts.routes[i], opts.width))
        writeFileSync(file, await fullPagePng(wc, opts.width))
        files.push(file)
        progress(i + 1, opts.routes.length, file)
      }
    } finally {
      await cdp(wc, 'Emulation.clearDeviceMetricsOverride').catch(() => {})
      await cdp(wc, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: '' }] }).catch(() => {})
      if (back) wc.loadURL(back).catch(() => {})
    }
    return { folder: opts.folder, files }
  }
}
