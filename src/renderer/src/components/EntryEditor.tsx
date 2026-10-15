import { useMemo, useState } from 'react'
import { Eye, EyeOff, RefreshCw } from 'lucide-react'
import Modal from './ui/Modal'
import { useVault, ALL_ENTRIES } from '../store/vault'
import { generatePassword, passwordStrength } from '../lib/generator'
import type { GroupMeta } from '../types'

export default function EntryEditor(): JSX.Element {
  const editingEntryId = useVault((s) => s.editingEntryId)
  const entries = useVault((s) => s.entries)
  const groups = useVault((s) => s.groups)
  const selectedGroupId = useVault((s) => s.selectedGroupId)
  const settings = useVault((s) => s.settings)
  const setEditorOpen = useVault((s) => s.setEditorOpen)
  const addEntry = useVault((s) => s.addEntry)
  const updateEntry = useVault((s) => s.updateEntry)

  const editing = editingEntryId ? entries.find((e) => e.uuid === editingEntryId) : null

  const [title, setTitle] = useState(editing?.title ?? '')
  const [username, setUsername] = useState(editing?.username ?? '')
  const [password, setPassword] = useState(editing?.password ?? '')
  const [url, setUrl] = useState(editing?.url ?? '')
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [totp, setTotp] = useState('')
  const [groupId, setGroupId] = useState(editing?.groupId ?? selectedGroupId)
  const [showPw, setShowPw] = useState(false)

  const flatGroups = useMemo(() => {
    const out: { uuid: string; name: string; depth: number }[] = []
    const walk = (g: GroupMeta, depth: number): void => {
      out.push({ uuid: g.uuid, name: g.name, depth })
      for (const c of g.children) walk(c, depth + 1)
    }
    for (const g of groups) walk(g, 0)
    return out
  }, [groups])

  const strength = passwordStrength(password)

  function handleSave(): void {
    const data = { title: title.trim(), username, password, url, notes, totp: totp.trim() }
    if (editing) updateEntry(editing.uuid, data)
    else addEntry(groupId, data)
    setEditorOpen(false)
  }

  return (
    <Modal title={editing ? '编辑条目' : '新建条目'} onClose={() => setEditorOpen(false)} width={560}>
      <div className="space-y-3.5">
        <LabeledInput label="标题" value={title} onChange={setTitle} autoFocus placeholder="例如：GitHub" />
        <LabeledInput label="用户名" value={username} onChange={setUsername} placeholder="例如：user@example.com" />

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">密码</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入或生成密码"
                className="w-full px-3 py-2 pr-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm selectable"
              />
              <button
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <button
              onClick={() => setPassword(generatePassword(settings.generator))}
              className="px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="生成强密码"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {password && (
            <div className="mt-2 flex items-center gap-1.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-colors"
                  style={{ background: i <= strength.score ? strength.color : '#e2e8f0' }}
                />
              ))}
              <span className="text-xs ml-1 text-slate-500">{strength.label}</span>
            </div>
          )}
        </div>

        <LabeledInput label="网址" value={url} onChange={setUrl} placeholder="https://" />
        <LabeledInput label="两步验证 (otpauth:// 链接，可选)" value={totp} onChange={setTotp} placeholder="otpauth://totp/..." />

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">备注</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="备注信息"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none selectable"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">分组</label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value={ALL_ENTRIES}>（根目录）</option>
            {flatGroups.map((g) => (
              <option key={g.uuid} value={g.uuid}>
                {'\u3000'.repeat(g.depth)}
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={() => setEditorOpen(false)}
            className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() && !username}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium transition-colors"
          >
            {editing ? '保存' : '添加'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
}): JSX.Element {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm selectable"
      />
    </div>
  )
}
