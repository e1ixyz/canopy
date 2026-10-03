import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { homedir } from 'node:os'
import type { OrchApi } from '@shared/ipc'

const api: OrchApi = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) =>
      (cb as (...a: unknown[]) => void)(...args)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
  homedir: homedir(),
  platform: process.platform,
}

contextBridge.exposeInMainWorld('orch', api)
