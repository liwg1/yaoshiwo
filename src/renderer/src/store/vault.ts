import { create } from 'zustand'
import type { Kdbx } from 'kdbxweb'
import {
  loadDatabase,
  createDatabase,
  saveDatabase,
  extractEntries,
  extractGroups,
  findEntry,
  getTotpConfig,
  getEntryHistory,
  cleanupDuplicateHistory,
  upsertLoginEntry,
  type BrowserCredential,
  type EntryHistory,
  type HistoryCleanupResult,
  createEntry as kdbxCreateEntry,
  updateEntry as kdbxUpdateEntry,
  removeEntry as kdbxRemoveEntry,
  moveEntryToGroup,
  addGroup as kdbxAddGroup,
  renameGroup as kdbxRenameGroup,
  removeGroup as kdbxRemoveGroup,
  type EntryData
} from '../lib/kdbx'
import { arrayBufferToBase64, basename } from '../lib/utils'
import type { EntryMeta, GroupMeta, AppSettings } from '../types'

const SETTINGS_KEY = 'safevault.settings'
const AUTO_LOCK_MIGRATED_KEY = 'safevault.settings.autoLockOff'

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  fontScale: 1,
  // 默认不自动锁定：锁定会使浏览器扩展无法自动填充/保存，只有用户主动锁定才锁
  autoLockMinutes: 0,
  clipboardClearSeconds: 30,
  // 关闭窗口时默认每次询问，用户可在设置里固定为「放到状态栏」或「永久关闭」
  closeAction: 'ask',
  generator: {
    length: 20,
    upper: true,
    lower: true,
    digits: true,
    symbols: true,
    excludeAmbiguous: false
  }
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parsed,
        generator: { ...DEFAULT_SETTINGS.generator, ...(parsed.generator ?? {}) }
      }
      // 一次性迁移：老版本默认 5 分钟自动锁定，改用「不自动锁定」，
      // 之后用户在设置里的选择会被正常保留。
      try {
        if (!localStorage.getItem(AUTO_LOCK_MIGRATED_KEY)) {
          merged.autoLockMinutes = 0
          localStorage.setItem(AUTO_LOCK_MIGRATED_KEY, '1')
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(merged))
        }
      } catch {
        /* ignore */
      }
      return merged
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(AUTO_LOCK_MIGRATED_KEY, '1')
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS, generator: { ...DEFAULT_SETTINGS.generator } }
}

function persistSettings(s: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

let db: Kdbx | null = null

export const ALL_ENTRIES = '__all__'

interface VaultState {
  locked: boolean
  fileName: string | null
  filePath: string | null
  dirty: boolean
  saving: boolean
  entries: EntryMeta[]
  groups: GroupMeta[]
  selectedEntryId: string | null
  selectedGroupId: string
  search: string
  settings: AppSettings

  editorOpen: boolean
  editingEntryId: string | null
  generatorOpen: boolean
  settingsOpen: boolean
  toast: string | null
  error: string | null

  loadFromData: (
    data: ArrayBuffer,
    password: string,
    path: string | null,
    keyFile?: ArrayBuffer | null
  ) => Promise<boolean>
  createNew: (name: string, password: string) => Promise<void>
  lock: () => Promise<void>
  save: (silent?: boolean) => Promise<boolean>
  refresh: () => void

  selectEntry: (id: string | null) => void
  selectGroup: (id: string) => void
  setSearch: (q: string) => void
  getEntryTotp: (entryId: string) => ReturnType<typeof getTotpConfig>
  getEntryHistory: (entryId: string) => EntryHistory | null
  /** 清理冗余的密码历史快照（不传 uuid 则清理整库），清理前会自动备份数据库文件 */
  cleanupHistory: (entryId?: string) => Promise<HistoryCleanupResult | null>
  saveFromBrowser: (
    data: BrowserCredential
  ) => Promise<{ ok: boolean; action?: 'created' | 'updated'; title?: string; error?: string }>

  addEntry: (groupId: string, data: EntryData) => void
  updateEntry: (id: string, data: EntryData) => void
  deleteEntry: (id: string) => void
  moveEntry: (id: string, groupId: string) => void
  addGroup: (parentId: string, name: string) => void
  renameGroup: (id: string, name: string) => void
  deleteGroup: (id: string) => void

  setTheme: (t: AppSettings['theme']) => void
  setFontScale: (n: number) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateGenerator: (patch: Partial<AppSettings['generator']>) => void

  copyToClipboard: (text: string) => Promise<void>
  showToast: (msg: string) => void

  setEditorOpen: (open: boolean, editingId?: string | null) => void
  setGeneratorOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  clearError: () => void
}

/** 把可自动填充的凭证同步给主进程本地服务（仅供浏览器扩展查询） */
function pushCredentials(entries: EntryMeta[]): void {
  const list = entries
    .filter((e) => e.url && e.username && e.password)
    .map((e) => ({
      uuid: e.uuid,
      title: e.title,
      username: e.username,
      password: e.password,
      url: e.url
    }))
  window.api.syncCredentials(list)
}

export const useVault = create<VaultState>()((set, get) => {
  const refresh = (): void => {
    const d = db
    if (!d) return
    const root = d.getDefaultGroup()
    const list = extractEntries(root)
    set({ entries: list, groups: extractGroups(root), dirty: true })
    pushCredentials(list)
  }

  const commit = (): void => {
    refresh()
    void get().save(true)
  }

  return {
    locked: true,
    fileName: null,
    filePath: null,
    dirty: false,
    saving: false,
    entries: [],
    groups: [],
    selectedEntryId: null,
    selectedGroupId: ALL_ENTRIES,
    search: '',
    settings: loadSettings(),

    editorOpen: false,
    editingEntryId: null,
    generatorOpen: false,
    settingsOpen: false,
    toast: null,
    error: null,

    loadFromData: async (data, password, path, keyFile = null) => {
      try {
        const d = await loadDatabase(data, password, keyFile)
        db = d
        const root = d.getDefaultGroup()
        const list = extractEntries(root)
        set({
          locked: false,
          fileName: path ? basename(path) : '未命名密码库',
          filePath: path,
          entries: list,
          groups: extractGroups(root),
          selectedEntryId: null,
          selectedGroupId: ALL_ENTRIES,
          search: '',
          dirty: false,
          error: null
        })
        pushCredentials(list)
        if (path) void window.api.addRecent(path)
        return true
      } catch {
        set({ error: '打开失败：密码错误或文件损坏' })
        return false
      }
    },

    createNew: async (name, password) => {
      const d = createDatabase(name, password)
      db = d
      const root = d.getDefaultGroup()
      set({
        locked: false,
        fileName: name,
        filePath: null,
        entries: extractEntries(root),
        groups: extractGroups(root),
        selectedEntryId: null,
        selectedGroupId: ALL_ENTRIES,
        search: '',
        dirty: true,
        error: null
      })
      await get().save()
    },

    lock: async () => {
      if (db && get().dirty) {
        await get().save(true)
      }
      db = null
      window.api.clearCredentials()
      set({
        locked: true,
        fileName: null,
        filePath: null,
        entries: [],
        groups: [],
        selectedEntryId: null,
        selectedGroupId: ALL_ENTRIES,
        search: '',
        dirty: false,
        editorOpen: false,
        editingEntryId: null,
        generatorOpen: false,
        settingsOpen: false,
        error: null
      })
    },

    save: async (silent = false) => {
      const d = db
      if (!d) return false
      if (get().saving) return false
      set({ saving: true })
      try {
        const data = await saveDatabase(d)
        let path = get().filePath
        if (!path) {
          const res = await window.api.saveFile(get().fileName ?? '钥匙窝.kdbx')
          if (res.canceled || !res.path) {
            set({ saving: false })
            return false
          }
          path = res.path
          set({ filePath: path, fileName: basename(path) })
        }
        await window.api.writeFile(path, arrayBufferToBase64(data))
        void window.api.addRecent(path)
        set({ dirty: false, saving: false, error: null })
        if (!silent) get().showToast('已保存')
        return true
      } catch (e) {
        set({ saving: false, error: '保存失败：' + String(e) })
        return false
      }
    },

    refresh,

    selectEntry: (id) => set({ selectedEntryId: id }),
    selectGroup: (id) => set({ selectedGroupId: id, selectedEntryId: null }),
    setSearch: (q) => set({ search: q }),
    getEntryTotp: (entryId) => {
      if (!db) return null
      const e = findEntry(db, entryId)
      return e ? getTotpConfig(e) : null
    },
    getEntryHistory: (entryId) => {
      if (!db) return null
      return getEntryHistory(db, entryId)
    },
    cleanupHistory: async (entryId) => {
      const d = db
      if (!d) return null
      try {
        const result = cleanupDuplicateHistory(d, entryId)
        if (result.removed === 0) {
          get().showToast('没有需要清理的重复记录')
          return result
        }
        // 落盘前先备份现有数据库，万一清理得不合心意还能找回
        const path = get().filePath
        if (path) {
          try {
            const b64 = await window.api.readFile(path)
            const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
            await window.api.writeFile(`${path}.bak-${stamp}`, b64)
          } catch {
            /* 备份失败不阻塞清理，下面的提示会说明 */
          }
        }
        set({ dirty: true, error: null })
        const ok = await get().save(true)
        if (!ok) {
          get().showToast('清理后保存失败，数据库文件没有被改动')
          return null
        }
        get().refresh()
        get().showToast(
          `已删除 ${result.removed} 条重复的密码历史（涉及 ${result.entries} 个条目）`
        )
        return result
      } catch (e) {
        set({ error: '清理历史失败：' + String(e) })
        return null
      }
    },
    saveFromBrowser: async (data) => {
      const d = db
      if (!d) return { ok: false, error: 'locked' }
      try {
        const result = upsertLoginEntry(d, data)
        refresh()
        await get().save(true)
        get().showToast(
          result.action === 'updated'
            ? `已更新密码：${result.title}`
            : `已从浏览器保存：${result.title}`
        )
        return { ok: true, action: result.action, title: result.title }
      } catch (e) {
        return { ok: false, error: String(e) }
      }
    },

    addEntry: (groupId, data) => {
      if (!db) return
      kdbxCreateEntry(db, groupId, data)
      commit()
    },
    updateEntry: (id, data) => {
      if (!db) return
      kdbxUpdateEntry(db, id, data)
      commit()
    },
    deleteEntry: (id) => {
      if (!db) return
      kdbxRemoveEntry(db, id)
      set({ selectedEntryId: null })
      commit()
    },
    moveEntry: (id, groupId) => {
      if (!db) return
      moveEntryToGroup(db, id, groupId)
      commit()
    },
    addGroup: (parentId, name) => {
      if (!db) return
      kdbxAddGroup(db, parentId, name)
      commit()
    },
    renameGroup: (id, name) => {
      if (!db) return
      kdbxRenameGroup(db, id, name)
      commit()
    },
    deleteGroup: (id) => {
      if (!db) return
      kdbxRemoveGroup(db, id)
      set({ selectedGroupId: ALL_ENTRIES, selectedEntryId: null })
      commit()
    },

    setTheme: (t) => {
      const s = { ...get().settings, theme: t }
      set({ settings: s })
      persistSettings(s)
    },
    setFontScale: (n) => {
      const s = { ...get().settings, fontScale: n }
      set({ settings: s })
      persistSettings(s)
    },
    updateSettings: (patch) => {
      const s = { ...get().settings, ...patch }
      set({ settings: s })
      persistSettings(s)
    },
    updateGenerator: (patch) => {
      const s = { ...get().settings, generator: { ...get().settings.generator, ...patch } }
      set({ settings: s })
      persistSettings(s)
    },

    copyToClipboard: async (text) => {
      await window.api.clipboardWrite(text, get().settings.clipboardClearSeconds * 1000)
      get().showToast('已复制到剪贴板')
    },
    showToast: (msg) => {
      set({ toast: msg })
      setTimeout(() => {
        if (get().toast === msg) set({ toast: null })
      }, 2200)
    },

    setEditorOpen: (open, editingId = null) =>
      set({ editorOpen: open, editingEntryId: open ? editingId : null }),
    setGeneratorOpen: (open) => set({ generatorOpen: open }),
    setSettingsOpen: (open) => set({ settingsOpen: open }),
    clearError: () => set({ error: null })
  }
})
