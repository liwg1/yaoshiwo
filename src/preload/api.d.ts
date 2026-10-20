export interface OpenFileResult {
  canceled: boolean
  path?: string
  data?: string
  error?: string
}

export interface SaveFileResult {
  canceled: boolean
  path?: string
}

export interface SafeVaultApi {
  openFile: () => Promise<OpenFileResult>
  openKeyFile: () => Promise<OpenFileResult>
  saveFile: (defaultName: string) => Promise<SaveFileResult>
  writeFile: (path: string, dataB64: string) => Promise<boolean>
  readFile: (path: string) => Promise<string>
  fetchFavicon: (domain: string) => Promise<{ data: string | null }>
  clipboardWrite: (text: string, clearMs: number) => Promise<boolean>
  clipboardClear: () => Promise<boolean>
  openExternal: (url: string) => Promise<boolean>
  getRecent: () => Promise<string[]>
  addRecent: (path: string) => Promise<string[]>
  removeRecent: (path: string) => Promise<string[]>
  setTheme: (theme: string) => Promise<void>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  hideWindow: () => Promise<void>
  showWindow: () => Promise<void>
  quit: () => Promise<void>
  getVersion: () => Promise<string>
  getExtensionConfig: () => Promise<{
    port: number
    token: string
    enabled: boolean
    running: boolean
  }>
  setExtensionEnabled: (value: boolean) => Promise<{
    port: number
    token: string
    enabled: boolean
    running: boolean
  }>
  regenerateToken: () => Promise<{
    port: number
    token: string
    enabled: boolean
    running: boolean
  }>
  syncCredentials: (list: unknown) => void
  clearCredentials: () => void
  onSaveRequest: (cb: (payload: unknown) => void) => () => void
  sendSaveResult: (id: string, result: unknown) => void
  onLockRequest: (cb: () => void) => () => void
  onQuitRequest: (cb: () => void) => () => void
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void
  onBeforeClose: (cb: () => void) => () => void
}

declare global {
  interface Window {
    api: SafeVaultApi
  }
}
