import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ShieldCheck,
  Search,
  Plus,
  FolderOpen,
  Sun,
  Moon,
  Monitor,
  Settings,
  Save,
  LogOut,
  Minus,
  Square,
  Copy,
  X,
  Loader2,
  Sparkles,
  Puzzle
} from 'lucide-react'
import { useVault } from '../store/vault'
import GroupTree from './GroupTree'
import EntryList from './EntryList'
import EntryDetail from './EntryDetail'
import EntryEditor from './EntryEditor'
import PasswordGenerator from './PasswordGenerator'
import SettingsPanel from './SettingsPanel'
import { useCloseGuard } from './CloseGuard'

export default function MainLayout(): JSX.Element {
  const editorOpen = useVault((s) => s.editorOpen)
  const generatorOpen = useVault((s) => s.generatorOpen)
  const settingsOpen = useVault((s) => s.settingsOpen)
  const { requestClose, dialog: closeDialog } = useCloseGuard()

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 'l') {
        e.preventDefault()
        void useVault.getState().lock()
      } else if (k === 'n') {
        e.preventDefault()
        useVault.getState().setEditorOpen(true, null)
      } else if (k === 'f') {
        e.preventDefault()
        document.getElementById('global-search')?.focus()
      } else if (k === 's') {
        e.preventDefault()
        void useVault.getState().save(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      <Titlebar onRequestClose={requestClose} />
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <GroupTree />
        <EntryList />
        <EntryDetail />
      </div>
      {editorOpen && <EntryEditor />}
      {generatorOpen && <PasswordGenerator />}
      {settingsOpen && <SettingsPanel />}
      {closeDialog}
    </div>
  )
}

function Titlebar({ onRequestClose }: { onRequestClose: () => void }): JSX.Element {
  const fileName = useVault((s) => s.fileName)
  const dirty = useVault((s) => s.dirty)
  const [mx, setMx] = useState(false)

  useEffect(() => {
    void window.api.isMaximized().then(setMx)
    return window.api.onMaximizeChange(setMx)
  }, [])

  async function handleClose(): Promise<void> {
    const st = useVault.getState()
    if (!st.locked && st.dirty) {
      const ok = await st.save(true)
      if (!ok) return
    }
    // 关闭按钮 -> 首次询问「放到状态栏 / 永久关闭」，记住后不再询问
    onRequestClose()
  }

  return (
    <div className="h-11 shrink-0 flex items-center bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 drag-region">
      <div className="flex items-center gap-2 px-4 min-w-0">
        <ShieldCheck size={18} className="text-blue-600 shrink-0" />
        <span className="text-sm font-semibold">钥匙窝</span>
        {fileName && (
          <>
            <span className="text-xs text-slate-400 truncate">
              {dirty ? '● ' : ''}
              {fileName}
            </span>
            <button
              onClick={() => void useVault.getState().lock()}
              className="no-drag p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="切换数据库"
            >
              <FolderOpen size={14} />
            </button>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center no-drag">
        <WinBtn onClick={() => void window.api.minimize()} title="最小化">
          <Minus size={15} />
        </WinBtn>
        <WinBtn onClick={() => void window.api.toggleMaximize()} title="最大化/还原">
          {mx ? <Copy size={13} /> : <Square size={13} />}
        </WinBtn>
        <WinBtn onClick={() => void handleClose()} title="关闭（可选放到状态栏 / 永久关闭）" danger>
          <X size={15} />
        </WinBtn>
      </div>
    </div>
  )
}

function WinBtn({
  children,
  onClick,
  title,
  danger
}: {
  children: JSX.Element
  onClick: () => void
  title: string
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-11 h-11 flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 transition-all active:scale-95 ${
        danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar(): JSX.Element {
  const search = useVault((s) => s.search)
  const setSearch = useVault((s) => s.setSearch)
  const settings = useVault((s) => s.settings)
  const setTheme = useVault((s) => s.setTheme)
  const saving = useVault((s) => s.saving)

  const themeIcon =
    settings.theme === 'dark' ? (
      <Moon size={16} />
    ) : settings.theme === 'light' ? (
      <Sun size={16} />
    ) : (
      <Monitor size={16} />
    )
  const nextTheme = settings.theme === 'light' ? 'dark' : settings.theme === 'dark' ? 'system' : 'light'

  return (
    <div className="h-12 shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      <div />
      <div className="relative w-[340px] max-w-full">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          id="global-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索条目 · 支持拼音 (Ctrl+F)"
          className="w-full pl-9 pr-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none ring-1 ring-transparent focus:ring-2 focus:ring-blue-500 focus:shadow-md focus:shadow-blue-500/10 transition-shadow placeholder:text-slate-400 selectable"
        />
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <ToolBtn onClick={() => useVault.getState().setEditorOpen(true, null)} primary title="新建条目 (Ctrl+N)">
          <Plus size={16} />
          <span>新建条目</span>
        </ToolBtn>
        <ToolBtn onClick={() => useVault.getState().setGeneratorOpen(true)} title="密码生成器">
          <Sparkles size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => useVault.getState().setSettingsOpen(true)} title="浏览器扩展 · 自动填充（访问令牌在这里）">
          <Puzzle size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => setTheme(nextTheme)} title="切换主题">
          {themeIcon}
        </ToolBtn>
        <ToolBtn onClick={() => void useVault.getState().save(false)} title="保存 (Ctrl+S)">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        </ToolBtn>
        <ToolBtn onClick={() => useVault.getState().setSettingsOpen(true)} title="设置">
          <Settings size={16} />
        </ToolBtn>
        <ToolBtn onClick={() => void useVault.getState().lock()} title="锁定 (Ctrl+L)">
          <LogOut size={16} />
        </ToolBtn>
      </div>
    </div>
  )
}

function ToolBtn({
  children,
  onClick,
  title,
  primary
}: {
  children: ReactNode
  onClick: () => void
  title: string
  primary?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95 ${
        primary
          ? 'bg-blue-600 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/25 text-white'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}
