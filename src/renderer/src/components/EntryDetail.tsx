import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import {
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Trash2,
  KeyRound,
  User,
  Globe,
  FileText,
  Clock,
  History
} from 'lucide-react'
import { useVault } from '../store/vault'
import EntryAvatar from './EntryAvatar'
import { generateTotp } from '../lib/totp'
import { formatDateTime } from '../lib/utils'
import { ConfirmDialog } from './ui/dialogs'
import Modal from './ui/Modal'
import type { EntryHistory } from '../lib/kdbx'

function loadWidth(): number {
  const n = Number(localStorage.getItem('safevault.detailWidth'))
  return n >= 260 && n <= 640 ? n : 320
}

function relativeLabel(d: Date | null): string {
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days} 天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} 个月前`
  return `${Math.floor(months / 12)} 年前`
}

export default function EntryDetail(): JSX.Element {
  const entries = useVault((s) => s.entries)
  const selectedEntryId = useVault((s) => s.selectedEntryId)
  const copyToClipboard = useVault((s) => s.copyToClipboard)
  const setEditorOpen = useVault((s) => s.setEditorOpen)
  const deleteEntry = useVault((s) => s.deleteEntry)
  const cleanupHistory = useVault((s) => s.cleanupHistory)

  const entry = entries.find((e) => e.uuid === selectedEntryId)
  const [showPw, setShowPw] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<EntryHistory | null>(null)
  const [revealedIdx, setRevealedIdx] = useState<number | null>(null)
  const [confirmClean, setConfirmClean] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [totpRemaining, setTotpRemaining] = useState(0)
  const [width, setWidth] = useState(loadWidth)

  useEffect(() => {
    setShowPw(false)
    setConfirmDel(false)
    if (!entry || !entry.hasTotp) {
      setTotpCode('')
      return
    }
    let cancelled = false
    const tick = async (): Promise<void> => {
      const cfg = useVault.getState().getEntryTotp(entry.uuid)
      if (!cfg) return
      const code = await generateTotp(cfg)
      const period = cfg.period ?? 30
      const remaining = period - (Math.floor(Date.now() / 1000) % period)
      if (!cancelled) {
        setTotpCode(code)
        setTotpRemaining(remaining)
      }
    }
    void tick()
    const iv = setInterval(() => void tick(), 1000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [entry])

  function startResize(e: ReactMouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const onMove = (ev: globalThis.MouseEvent): void => {
      const next = Math.min(640, Math.max(260, startW + (startX - ev.clientX)))
      setWidth(next)
      localStorage.setItem('safevault.detailWidth', String(next))
    }
    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
  }

  const handle = (
    <div
      onMouseDown={startResize}
      className="absolute left-0 top-0 h-full w-1.5 -ml-0.5 z-10 cursor-col-resize hover:bg-blue-400/40 active:bg-blue-500/50 transition-colors"
      title="拖拽调整宽度"
    />
  )

  if (!entry) {
    return (
      <aside
        style={{ width }}
        className="relative shrink-0 flex flex-col items-center justify-center bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500"
      >
        {handle}
        <KeyRound size={36} className="mb-3 opacity-40" />
        <p className="text-sm">选择一个条目查看详情</p>
      </aside>
    )
  }

  /** 真正从数据库里删掉「密码没变」和「密码重复」的历史快照（保存前会自动备份） */
  async function runCleanup(): Promise<void> {
    setConfirmClean(false)
    const id = entry?.uuid
    if (!id) return
    await cleanupHistory(id)
    setHistory(useVault.getState().getEntryHistory(id))
    setRevealedIdx(null)
  }

  return (
    <aside style={{ width }} className="relative shrink-0 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      {handle}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <EntryAvatar url={entry.url} title={entry.title} size={40} />
        <div className="flex-1 min-w-0">
          <h2 className="truncate font-semibold text-slate-900 dark:text-slate-100">{entry.title || '(无标题)'}</h2>
          {entry.groupPath.length > 0 && (
            <p className="truncate text-xs text-slate-400">{entry.groupPath.join(' / ')}</p>
          )}
        </div>
        <button
          onClick={() => {
            setHistory(useVault.getState().getEntryHistory(entry.uuid))
            setRevealedIdx(null)
            setHistoryOpen(true)
          }}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="密码更新历史"
        >
          <History size={16} />
        </button>
        <button
          onClick={() => setEditorOpen(true, entry.uuid)}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="编辑"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => setConfirmDel(true)}
          className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          title="删除"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <Field
          label="用户名"
          value={entry.username}
          icon={<User size={14} />}
          onCopy={() => void copyToClipboard(entry.username)}
        />

        <Field
          label="密码"
          value={entry.password}
          icon={<KeyRound size={14} />}
          masked={!showPw}
          onToggleMask={() => setShowPw((v) => !v)}
          onCopy={() => void copyToClipboard(entry.password)}
        />

        {entry.hasTotp && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 flex items-center gap-1.5">
                <Clock size={13} />
                两步验证码
              </span>
              <button
                onClick={() => void copyToClipboard(totpCode)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                title="复制"
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="font-mono text-xl tracking-widest text-slate-900 dark:text-slate-100 selectable">
                {totpCode || '------'}
              </span>
              <span
                className="ml-auto w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: `conic-gradient(#3b76f6 ${(totpRemaining / 30) * 360}deg, #e2e8f0 0deg)` }}
              >
                <span className="w-4 h-4 rounded-full bg-white dark:bg-slate-900 flex items-center justify-center text-[10px] font-medium text-slate-600 dark:text-slate-300">
                  {totpRemaining}
                </span>
              </span>
            </div>
          </div>
        )}

        {entry.url && (
          <Field
            label="网址"
            value={entry.url}
            icon={<Globe size={14} />}
            onCopy={() => void copyToClipboard(entry.url)}
            onOpen={() => window.open(entry.url)}
          />
        )}

        {entry.notes && (
          <div>
            <span className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
              <FileText size={13} />
              备注
            </span>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words selectable leading-relaxed">
              {entry.notes}
            </p>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
          {entry.created && <p>创建：{formatDateTime(entry.created)}</p>}
          {entry.modified && <p>修改：{formatDateTime(entry.modified)}</p>}
        </div>
      </div>

      {historyOpen && (
        <Modal title="密码更新历史" onClose={() => setHistoryOpen(false)} width={440}>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 text-xs font-medium">
              {history?.count ?? 0} 次密码更新
            </span>
            <span className="text-xs text-slate-400">
              {history && history.rawCount > history.count
                ? `另有 ${history.rawCount - history.count} 次修改没有改变密码，已省略`
                : '每次修改密码都会在此记录一个历史版本'}
            </span>
          </div>
          {!history || history.count === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              <History size={28} className="mx-auto mb-2 opacity-40" />
              没有密码变更记录
            </div>
          ) : (
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {history.items.map((it, i) => {
                const open = revealedIdx === i
                return (
                  <li key={i} className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 shrink-0 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-300 flex items-center justify-center text-[11px] font-semibold">
                        {history.count - i}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-800 dark:text-slate-100">
                          {it.modified ? formatDateTime(it.modified) : '时间未知'}
                        </p>
                        <p className="text-xs text-slate-400">{relativeLabel(it.modified)}</p>
                      </div>
                      <button
                        onClick={() => setRevealedIdx(open ? null : i)}
                        className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-md text-xs text-slate-500 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                        title={open ? '隐藏历史密码' : '查看历史密码'}
                      >
                        {open ? <EyeOff size={14} /> : <Eye size={14} />}
                        历史密码
                      </button>
                    </div>
                    {open && (
                      <div className="mt-2.5 flex items-center gap-1.5 pl-9">
                        <code className="flex-1 min-w-0 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 font-mono text-sm text-slate-800 dark:text-slate-100 break-all selectable">
                          {it.password || '（此版本无密码）'}
                        </code>
                        <button
                          onClick={() => void copyToClipboard(it.password)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 shrink-0 transition-colors"
                          title="复制历史密码"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {history && history.rawCount > 0 && (
            <button
              onClick={() => setConfirmClean(true)}
              className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              title="从数据库里真正删除「密码没变」和「密码重复」的历史快照"
            >
              <Trash2 size={13} />
              清理重复记录
              {history.rawCount > history.count ? `（可删除 ${history.rawCount - history.count} 条）` : ''}
            </button>
          )}
        </Modal>
      )}

      {confirmClean && (
        <ConfirmDialog
          title="清理重复的密码历史"
          message="将从这个条目里永久删除「密码没有变化」以及「密码重复」的历史快照，只保留真正换过的密码。清理前会自动备份一份数据库文件。"
          confirmText="清理"
          onConfirm={() => void runCleanup()}
          onClose={() => setConfirmClean(false)}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          title="删除条目"
          message={`确定要删除条目「${entry.title || '(无标题)'}」吗？`}
          onConfirm={() => deleteEntry(entry.uuid)}
          onClose={() => setConfirmDel(false)}
        />
      )}
    </aside>
  )
}

function Field({
  label,
  value,
  icon,
  masked,
  onToggleMask,
  onCopy,
  onOpen
}: {
  label: string
  value: string
  icon: JSX.Element
  masked?: boolean
  onToggleMask?: () => void
  onCopy: () => void
  onOpen?: () => void
}): JSX.Element {
  return (
    <div>
      <span className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
        {icon}
        {label}
      </span>
      <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg px-3 py-2">
        <span
          className="flex-1 min-w-0 text-sm text-slate-800 dark:text-slate-100 selectable overflow-x-auto whitespace-nowrap"
          style={{ scrollbarWidth: 'thin' }}
        >
          {masked ? '••••••••••••' : value || '—'}
        </span>
        {onToggleMask && (
          <button
            onClick={onToggleMask}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 transition-colors"
            title={masked ? '显示' : '隐藏'}
          >
            {masked ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        )}
        {onOpen && (
          <button onClick={onOpen} className="text-slate-400 hover:text-blue-600 shrink-0 transition-colors" title="打开链接">
            <ExternalLink size={15} />
          </button>
        )}
        <button
          onClick={onCopy}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 transition-colors"
          title="复制"
        >
          <Copy size={15} />
        </button>
      </div>
    </div>
  )
}
