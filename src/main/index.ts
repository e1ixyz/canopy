import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, shell, webContents } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { EventMap, InvokeMap, SendMap } from '@shared/ipc'
import { startBusServer } from './bus/server'
import { Hub } from './hub'
import { getPr } from './pr'
import { envFilesWith } from './db'
import { listHosts } from './hosts'
import { railwayProjects, revealVar } from './railway'
import { ensureDir, orchHome } from './paths'
import { listRecents, listTranscripts } from './recents'
import { listSkills } from './skills'
import { getState, loadState, saveState } from './store'
import { conflicts, branches, gitStatus, isGitRepo, listWorktrees } from './worktree/git'

const here = dirname(fileURLToPath(import.meta.url))
let win: BrowserWindow | null = null
let hub: Hub

const emit = <K extends keyof EventMap>(ch: K, ...args: Parameters<EventMap[K]>) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, ...args)
}

function handle<K extends keyof InvokeMap>(ch: K, fn: (...args: Parameters<InvokeMap[K]>) => ReturnType<InvokeMap[K]> | Promise<Awaited<ReturnType<InvokeMap[K]>>>) {
  ipcMain.handle(ch, (_e, ...args) => fn(...(args as Parameters<InvokeMap[K]>)))
}

function on<K extends keyof SendMap>(ch: K, fn: (...args: Parameters<SendMap[K]>) => void) {
  ipcMain.on(ch, (_e, ...args) => fn(...(args as Parameters<SendMap[K]>)))
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a10',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(here, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      webviewTag: true,
      backgroundThrottling: false,
    },
  })
  // A test instance must never steal focus from a real one.
  win.once('ready-to-show', () => (process.env.ORCH_USER_DATA ? win?.showInactive() : win?.show()))
  if (!app.isPackaged)
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') console.log(`[renderer:${e.level}] ${e.message} (${e.sourceId}:${e.lineNumber})`)
    })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(here, '../renderer/index.html'))
}

function registerIpc() {
  handle('state:get', () => ({ ...getState(), sessions: hub.list() }))
  handle('recents:list', () => listRecents())
  handle('project:open', (path) => hub.openProject(path))
  handle('project:pin', (id, pinned) => {
    const p = getState().projects.find((x) => x.id === id)
    if (p) p.pinned = pinned
    saveState()
  })
  handle('project:forget', (id) => {
    getState().projects = getState().projects.filter((p) => p.id !== id)
    saveState()
  })
  handle('dialog:openFolder', async () => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  handle('adapter:get', (p) => hub.worktrees.adapter(p))
  handle('worktree:list', async (p) => ((await isGitRepo(p)) ? hub.worktrees.list(p) : []))
  handle('worktree:create', (req) => hub.worktrees.create(req))
  handle('worktree:remove', async (path, force) => {
    for (const s of hub.list()) if (s.cwd === path || s.cwd.startsWith(path + '/')) hub.remove(s.id)
    return hub.worktrees.remove(path, force)
  })
  handle('git:status', (cwd) => gitStatus(cwd))
  handle('git:branches', (p) => branches(p))
  handle('conflicts:get', (p) => conflicts(p))
  handle('session:spawn', (req) => hub.spawn(req))
  handle('session:kill', (id) => hub.kill(id))
  handle('session:restart', (id) => hub.restart(id))
  handle('session:remove', (id) => hub.remove(id))
  handle('session:rename', (id, name) => hub.rename(id, name))
  handle('session:inUse', (cwd) => hub.inUse(cwd))
  handle('pty:buffer', (id) => hub.buffer(id))
  handle('pages:save', (pages, active) => {
    const st = getState()
    st.pages = pages
    st.activePageId = active
    saveState()
  })
  handle('bus:send', ({ to, body, wake, from }) => hub.bus.post(to === '*' || to === 'project' ? 'broadcast' : 'message', from ?? 'user', to, body, wake ?? true))
  handle('bus:clear', () => {
    getState().messages.length = 0
    saveState()
    emit('bus:cleared')
  })
  handle('claims:release', (id) => hub.bus.releaseById(id))
  handle('settings:set', (patch) => {
    const st = getState()
    st.settings = { ...st.settings, ...patch }
    saveState()
    return st.settings
  })
  handle('shot:save', (dataUrl, label) => {
    const dir = join(homedir(), 'Desktop', `${label.replace(/[^\w.-]+/g, '-')}-shots`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`)
    writeFileSync(file, nativeImage.createFromDataURL(dataUrl).toPNG())
    return file
  })
  handle('transcripts:list', async (p) => {
    const wts = await listWorktrees(p)
    const paths = wts.length ? wts.map((w) => w.path) : [p]
    return paths.flatMap((x) => listTranscripts(x)).sort((a, b) => b.mtime - a.mtime).slice(0, 40)
  })
  handle('shell:openExternal', (url) => {
    shell.openExternal(url)
  })
  handle('shell:reveal', (p) => shell.showItemInFolder(p))
  handle('dev:start', (cwd, projectPath) => hub.startDev(cwd, projectPath))
  handle('handoff:toNew', (id) => hub.requestHandoff(id, 'fresh'))
  handle('handoff:save', (id, close) => hub.requestHandoff(id, close ? 'saveClose' : 'save'))
  handle('handoffs:list', (p) => hub.listHandoffs(p))
  handle('handoffs:counts', () => hub.shelf.counts())
  handle('handoffs:rename', (file, title) => {
    hub.shelf.rename(file, title)
    emit('handoffs:changed')
  })
  handle('handoffs:remove', (file) => {
    hub.shelf.remove(file)
    emit('handoffs:changed')
  })
  handle('handoffs:open', (file) => {
    hub.shelf.read(file)
    shell.openPath(file)
  })
  handle('handoffs:import', async (projectPath) => {
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }], defaultPath: join(homedir(), 'Desktop') })
    if (r.canceled || !r.filePaths[0]) return null
    const h = hub.shelf.importFile(r.filePaths[0], projectPath)
    emit('handoffs:changed')
    return h
  })
  handle('handoffs:pickUp', (file, original) => hub.pickUp(file, original))
  handle('hosts:list', () => listHosts(getState().settings.hosts))
  handle('skills:list', (cwd) => listSkills(cwd))
  handle('session:retarget', (id, target) => hub.retarget(id, target))
  handle('db:info', (id) => hub.dbInfo(id))
  handle('db:envFiles', (cwd, varName) => envFilesWith(cwd, varName))
  handle('deploy:projects', () => railwayProjects())
  handle('deploy:suggest', (cwd, projectPath) => hub.deploySuggest(cwd, projectPath))
  handle('deploy:save', (repo, t) => hub.saveDeployTarget(repo, t))
  handle('deploy:vars', (id, envFile) => hub.deployVars(id, envFile))
  handle('deploy:reveal', (id, key) => revealVar(id, key))
  handle('deploy:ssh', (id) => hub.deploySsh(id))
  handle('prompts:get', (id, key, vars) => hub.prompt(id, key, vars))
  handle('prompts:shipTargets', (id) => hub.shipTargets(id))
  handle('adapters:openFolder', () => {
    shell.openPath(ensureDir(orchHome('adapters')))
  })
  handle('spawn:confirm', (rid, ok) => hub.confirmSpawn(rid, ok))
  handle('session:ack', (id) => hub.ack(id))
  handle('ports:list', () => hub.portsSnapshot())
  handle('ports:kill', (pid) => hub.killPid(pid))
  handle('usage:get', () => hub.usageSnapshot())
  handle('pr:get', (cwd, force) => getPr(cwd, force))
  handle('adapter:actions', (id) => hub.actionsFor(id))
  handle('badge:run', (id) => hub.runBadge(id))
  handle('session:setMeta', (id, meta) => hub.patch(id, meta))
  handle('goal:start', (id, opts) => {
    hub.startGoal(id, opts)
  })
  handle('goal:stop', (id) => hub.goals.stop(id))
  handle('ship:plan', (id) => hub.shipPlan(id))
  handle('preview:register', (sid, cwd, wcId) => hub.browser.register(sid, cwd, wcId))
  handle('preview:unregister', (sid, wcId) => hub.browser.unregister(sid, wcId))
  handle('shots:capture', (opts) => hub.browser.shotSet(opts.wcId, opts, (i, n, file) => emit('shots:progress', i, n, file)))
  handle('shots:remember', (projectPath, prefs) => {
    getState().shotSets[projectPath] = prefs
    saveState()
  })
  handle('handoff:allow', (id) => hub.allowHandoff(id))
  handle('shell:run', (cwd, projectPath, command, name) => hub.spawn({ kind: 'dev', cwd, projectPath, command, name }))
  handle('preview:shot', async (wcId, label) => {
    const wc = webContents.fromId(wcId)
    if (!wc) throw new Error('Preview is gone')
    const img = await wc.capturePage()
    const dir = join(homedir(), 'Desktop', `${label.replace(/[^\w.-]+/g, '-')}-shots`)
    mkdirSync(dir, { recursive: true })
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`)
    writeFileSync(file, img.toPNG())
    return file
  })
  handle('preview:capture', async (wcId) => {
    const wc = webContents.fromId(wcId)
    if (!wc) throw new Error('Preview is gone')
    return (await wc.capturePage()).toDataURL()
  })
  handle('preview:emulate', async (wcId, scheme) => {
    const wc = webContents.fromId(wcId)
    if (!wc) return
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3')
    await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: scheme ?? '' }],
    })
  })

  on('pty:write', (id, data) => hub.write(id, data))
  on('pty:resize', (id, c, r) => hub.resize(id, c, r))
}

app.setName('Orchestrator')
// A second, isolated instance (own state, own sessions) for testing next to a real one.
if (process.env.ORCH_USER_DATA) {
  app.setPath('userData', process.env.ORCH_USER_DATA)
  // Keep painting while hidden behind other windows so tooling can capture it.
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
}

app.whenReady().then(async () => {
  loadState()
  hub = new Hub(emit, ensureDir(orchHome('adapters')))
  hub.onAttention = (s, text) => {
    if (!getState().settings.notifications || win?.isFocused()) return
    const n = new Notification({ title: `${s.name} · ${basename(s.cwd)}`, body: text, silent: false })
    n.on('click', () => {
      win?.show()
      emit('ui:focusSession', s.id)
    })
    n.show()
  }
  await startBusServer(
    hub,
    (sid, url) => emit('ui:openPreview', sid, url),
    (sid, width) => emit('ui:previewWidth', sid, width),
  )
  registerIpc()
  hub.watcher.start()
  createWindow()
  // Compiled out of release builds; ORCH_DEBUG_BUILD=1 keeps it (install-app.sh does).
  if (__DEBUG_SERVER__ && (!app.isPackaged || process.env.ORCH_DEBUG_PORT)) startDebugServer()

  const onPage = new Set(getState().pages.flatMap((p) => p.tiles.map((t) => t.sessionId)))
  hub.restore(onPage)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  hub?.watcher.stop()
  hub?.dispose()
  hub?.killAll()
  saveState(true)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** Debug builds only: lets tooling screenshot the window and drive the renderer */
function startDebugServer() {
  createServer(async (req, res) => {
    try {
      if (!win) throw new Error('no window')
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/shot') {
        const img = await win.webContents.capturePage()
        res.writeHead(200, { 'Content-Type': 'image/png' }).end(img.toPNG())
      } else if (url.pathname === '/eval' && req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const out = await win.webContents.executeJavaScript(Buffer.concat(chunks).toString('utf8'), true)
        res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(out ?? null))
      } else if (url.pathname === '/show') {
        win.show()
        win.focus()
        res.end('ok')
      } else res.writeHead(404).end()
    } catch (e) {
      res.writeHead(500).end(String(e))
    }
  }).listen(Number(process.env.ORCH_DEBUG_PORT ?? 47899), '127.0.0.1')
}
