export interface EntryMeta {
  uuid: string
  title: string
  username: string
  password: string
  url: string
  notes: string
  searchKey: string
  hasTotp: boolean
  groupId: string
  groupPath: string[]
  icon: number
  created: Date | null
  modified: Date | null
}

export interface GroupMeta {
  uuid: string
  name: string
  parentId: string | null
  children: GroupMeta[]
}

export interface GeneratorSettings {
  length: number
  upper: boolean
  lower: boolean
  digits: boolean
  symbols: boolean
  excludeAmbiguous: boolean
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontScale: number
  autoLockMinutes: number
  clipboardClearSeconds: number
  /** 点击窗口关闭按钮时的行为：ask = 每次询问，tray = 放到状态栏，quit = 永久关闭 */
  closeAction: 'ask' | 'tray' | 'quit'
  generator: GeneratorSettings
}

export type ThemeMode = 'light' | 'dark'
