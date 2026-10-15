import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  FolderOpen,
  Plus,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ChevronLeft,
  FileKey2,
  X,
  Minus,
  Square,
  Copy,
  Trash2
} from 'lucide-react'
import { useVault } from '../store/vault'
import { base64ToArrayBuffer, basename } from '../lib/utils'
import TechBackground from './TechBackground'
import { useCloseGuard } from './CloseGuard'

type Stage = 'home' | 'unlock' | 'create'

export default function UnlockScreen(): JSX.Element {
  const loadFromData = useVault((s) => s.loadFromData)
  const createNew = useVault((s) => s.createNew)
  const error = useVault((s) => s.error)
  const clearError = useVault((s) => s.clearError)

  const [stage, setStage] = useState<Stage>('home')
  const [recent, setRecent] = useState<string[]>([])

  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [pendingData, setPendingData] = useState<ArrayBuffer | null>(null)
  const [keyFile, setKeyFile] = useState<ArrayBuffer | null>(null)
  const [keyFileName, setKeyFileName] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [busy, setBusy] = useState(false)

  const [newName, setNewName] = useState('我的密码库')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')

  const [mx, setMx] = useState(false)
  const { requestClose, dialog: closeDialog } = useCloseGuard()

  useEffect(() => {
    void window.api.getRecent().then(setRecent)
  }, [])

  useEffect(() => {
    void window.api.isMaximized().then(setMx)
    return window.api.onMaximizeChange(setMx)
  }, [])

  /** 从「最近使用」中移除一条记录 */
  async function removeRecent(path: string): Promise<void> {
    const list = await window.api.removeRecent(path)
    setRecent(list)
  }

  async function startOpen(path?: string): Promise<void> {
    setBusy(true)
    clearError()
    try {
      let p = path
      let dataB64: string | undefined
      if (p) {
        dataB64 = await window.api.readFile(p)
      } else {
        const res = await window.api.openFile()
        if (res.canceled) return
        p = res.path
        dataB64 = res.data
      }
      if (!p || dataB64 == null) return
      setPendingPath(p)
      setPendingName(basename(p))
      setPendingData(base64ToArrayBuffer(dataB64))
      setPassword('')
      setKeyFile(null)
      setKeyFileName('')
      setStage('unlock')
    } finally {
      setBusy(false)
    }
  }

  async function pickKeyFile(): Promise<void> {
    const res = await window.api.openKeyFile()
    if (res.canceled || res.data == null) return
    setKeyFile(base64ToArrayBuffer(res.data))
    setKeyFileName(res.path ? basename(res.path) : '密钥文件')
  }

  async function handleUnlock(): Promise<void> {
    if (!pendingData || !password) return
    setBusy(true)
    clearError()
    const ok = await loadFromData(pendingData, password, pendingPath, keyFile)
    setBusy(false)
    if (!ok) setPassword('')
  }

  async function handleCreate(): Promise<void> {
    if (!newName.trim() || !newPassword) return
    if (newPassword !== newPassword2) {
      clearError()
      return
    }
    setBusy(true)
    await createNew(newName.trim(), newPassword)
    setBusy(false)
  }

  return (
    <div className="relative h-screen w-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-white to-blue-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <TechBackground />

      {/* 顶部拖拽区（无边框窗口可在解锁页拖动） */}
      <div className="absolute top-0 left-0 right-0 h-10 drag-region z-10" />

      {/* 右上角窗口控制按钮 */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 no-drag">
        <WinBtn onClick={() => void window.api.minimize()} title="最小化">
          <Minus size={15} />
        </WinBtn>
        <WinBtn
          onClick={() => void window.api.toggleMaximize()}
          title={mx ? '向下还原' : '最大化'}
        >
          {mx ? <Copy size={13} /> : <Square size={13} />}
        </WinBtn>
        <WinBtn onClick={requestClose} title="关闭" danger>
          <X size={15} />
        </WinBtn>
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30">
            <ShieldCheck className="text-white" size={34} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">钥匙窝</h1>
          <p className="mt-1 text-[11px] font-semibold tracking-[0.32em] text-slate-400 dark:text-slate-500">
            YAO&nbsp;SHI&nbsp;WO
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">安全 · 现代 · 本地密码管理器</p>
        </div>

        {stage === 'home' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-6 animate-pop-in">
            {recent.length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-2">最近使用</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {recent.map((p) => (
                    <div
                      key={p}
                      className="group flex items-center gap-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <button
                        onClick={() => void startOpen(p)}
                        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 text-left"
                      >
                        <FolderOpen size={16} className="text-blue-500 shrink-0" />
                        <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-200">
                          {basename(p)}
                        </span>
                        <span className="text-[11px] text-slate-400 truncate max-w-[40%]">{p}</span>
                      </button>
                      <button
                        onClick={() => void removeRecent(p)}
                        className="p-1.5 mr-1.5 rounded-md shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                        title="从「最近使用」中移除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                onClick={() => void startOpen()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
              >
                <FolderOpen size={18} />
                打开密码库
              </button>
              <button
                onClick={() => {
                  clearError()
                  setNewPassword('')
                  setNewPassword2('')
                  setStage('create')
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium transition-colors"
              >
                <Plus size={18} />
                新建密码库
              </button>
            </div>
          </div>
        )}

        {stage === 'unlock' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-6 animate-pop-in">
            <button
              onClick={() => setStage('home')}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4"
            >
              <ChevronLeft size={16} />
              返回
            </button>
            <div className="flex items-center gap-2 mb-5">
              <FolderOpen size={18} className="text-blue-500 shrink-0" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{pendingName}</span>
            </div>

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">主密码</label>
            <div className="relative mb-3">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                autoFocus
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearError()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleUnlock()
                }}
                placeholder="输入主密码"
                className="w-full px-4 py-2.5 pr-11 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow selectable"
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>

            <div className="mb-4">
              {keyFile ? (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300">
                  <FileKey2 size={15} className="text-blue-500" />
                  <span className="flex-1 truncate">{keyFileName}</span>
                  <button onClick={() => { setKeyFile(null); setKeyFileName('') }} className="text-slate-400 hover:text-slate-600">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <button onClick={() => void pickKeyFile()} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  <FileKey2 size={15} />
                  使用密钥文件（可选）
                </button>
              )}
            </div>

            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-sm">{error}</div>
            )}

            <button
              onClick={() => void handleUnlock()}
              disabled={busy || !password}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
              解锁
            </button>
          </div>
        )}

        {stage === 'create' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-6 animate-pop-in">
            <button
              onClick={() => setStage('home')}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4"
            >
              <ChevronLeft size={16} />
              返回
            </button>

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">密码库名称</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2.5 mb-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent selectable"
            />

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">主密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="设置主密码"
              className="w-full px-4 py-2.5 mb-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent selectable"
            />

            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">确认主密码</label>
            <input
              type="password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
              }}
              placeholder="再次输入主密码"
              className="w-full px-4 py-2.5 mb-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent selectable"
            />

            {newPassword2 && newPassword !== newPassword2 && (
              <p className="text-xs text-red-500 mb-2">两次输入的密码不一致</p>
            )}

            <button
              onClick={() => void handleCreate()}
              disabled={busy || !newName.trim() || !newPassword || newPassword !== newPassword2}
              className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              创建
            </button>
          </div>
        )}
      </div>

      {closeDialog}
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
      className={`w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition-all active:scale-95 ${
        danger
          ? 'hover:bg-red-500 hover:text-white'
          : 'hover:bg-slate-200/70 dark:hover:bg-slate-700/70 hover:text-slate-800 dark:hover:text-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
