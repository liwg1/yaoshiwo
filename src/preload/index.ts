import { contextBridge, ipcRenderer } from 'electron'

const api = {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  openKeyFile: () => ipcRenderer.invoke('dialog:openKeyFile'),
  saveFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveFile', defaultName),
  writeFile: (path: string, dataB64: string) => ipcRenderer.invoke('file:write', path, dataB64),
  readFile: (path: string) => ipcRenderer.invoke('file:read', path),
  fetchFavicon: (domain: string) => ipcRenderer.invoke('favicon:fetch', domain),
  clipboardWrite: (text: string, clearMs: number) =>
    ipcRenderer.invoke('clipboard:write', text, clearMs),
  clipboardClear: () => ipcRenderer.invoke('clipboard:clear'),
  getRecent: () => ipcRenderer.invoke('app:getRecent'),
  addRecent: (path: string) => ipcRenderer.invoke('app:addRecent', path),
  removeRecent: (path: string) => ipcRenderer.invoke('app:removeRecent', path),
  setTheme: (theme: string) => ipcRenderer.invoke('app:setTheme', theme),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  close: () => ipcRenderer.invoke('window:close'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  showWindow: () => ipcRenderer.invoke('window:show'),
  quit: () => ipcRenderer.invoke('app:quit'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getExtensionConfig: () => ipcRenderer.invoke('extension:getConfig'),
  setExtensionEnabled: (value: boolean) => ipcRenderer.invoke('extension:setEnabled', value),
  regenerateToken: () => ipcRenderer.invoke('extension:regenerateToken'),
  syncCredentials: (list: unknown) => ipcRenderer.send('credentials:sync', list),
  clearCredentials: () => ipcRenderer.send('credentials:clear'),
  onSaveRequest: (cb: (payload: unknown) => void) => {
    const listener = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on('credential:save-request', listener)
    return () => ipcRenderer.removeListener('credential:save-request', listener)
  },
  sendSaveResult: (id: string, result: unknown) =>
    ipcRenderer.send('credential:save-result', id, result),
  onLockRequest: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('lock-request', listener)
    return () => ipcRenderer.removeListener('lock-request', listener)
  },
  onQuitRequest: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('quit-request', listener)
    return () => ipcRenderer.removeListener('quit-request', listener)
  },
  onMaximizeChange: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, maximized: boolean): void => cb(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
  onBeforeClose: (cb: () => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('app:before-close', listener)
    return () => ipcRenderer.removeListener('app:before-close', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
