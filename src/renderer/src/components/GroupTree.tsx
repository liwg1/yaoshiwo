import { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, Plus, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { useVault, ALL_ENTRIES } from '../store/vault'
import type { GroupMeta } from '../types'
import { entryColor } from '../lib/favicon'
import { PromptDialog, ConfirmDialog } from './ui/dialogs'

interface GroupDialog {
  type: 'add' | 'rename'
  parentId: string | null
  groupId?: string
}

export default function GroupTree(): JSX.Element {
  const groups = useVault((s) => s.groups)
  const selectedGroupId = useVault((s) => s.selectedGroupId)
  const selectGroup = useVault((s) => s.selectGroup)
  const addGroup = useVault((s) => s.addGroup)
  const renameGroup = useVault((s) => s.renameGroup)
  const deleteGroup = useVault((s) => s.deleteGroup)

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dialog, setDialog] = useState<GroupDialog | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  const toggle = (id: string): void => setCollapsed((c) => ({ ...c, [id]: !c[id] }))

  function renderNode(g: GroupMeta, depth: number): JSX.Element {
    const isCollapsed = collapsed[g.uuid]
    const hasChildren = g.children.length > 0
    const selected = selectedGroupId === g.uuid
    const color = entryColor(g.name || g.uuid)
    return (
      <div key={g.uuid}>
        <div
          className={`group flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-lg cursor-pointer text-sm transition-colors ${
            selected
              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
          style={{ paddingLeft: 8 + depth * 16 }}
          onClick={() => selectGroup(g.uuid)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (hasChildren) toggle(g.uuid)
            }}
            className="text-slate-400 shrink-0"
          >
            {hasChildren ? (
              isCollapsed ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )
            ) : (
              <span className="inline-block w-3.5" />
            )}
          </button>
          {selected ? (
            <FolderOpen size={15} className="shrink-0" style={{ color }} />
          ) : (
            <Folder size={15} className="shrink-0" style={{ color }} />
          )}
          <span className="flex-1 truncate">{g.name || '(未命名)'}</span>
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setMenuFor(menuFor === g.uuid ? null : g.uuid)
              }}
              className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <MoreVertical size={14} />
            </button>
            {menuFor === g.uuid && (
              <div className="absolute right-0 top-6 z-20 w-40 rounded-lg bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/10 dark:ring-white/10 py-1 animate-pop-in">
                <MenuItem
                  icon={<Plus size={14} />}
                  label="新建子分组"
                  onClick={() => {
                    setDialog({ type: 'add', parentId: g.uuid })
                    setMenuFor(null)
                  }}
                />
                <MenuItem
                  icon={<Pencil size={14} />}
                  label="重命名"
                  onClick={() => {
                    setDialog({ type: 'rename', parentId: null, groupId: g.uuid })
                    setMenuFor(null)
                  }}
                />
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label="删除"
                  danger
                  onClick={() => {
                    setDeleteTarget({ id: g.uuid, name: g.name })
                    setMenuFor(null)
                  }}
                />
              </div>
            )}
          </div>
        </div>
        {hasChildren && !isCollapsed && (
          <div>{g.children.map((c) => renderNode(c, depth + 1))}</div>
        )}
      </div>
    )
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between px-3 h-10 border-b border-slate-100 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">分组</span>
        <button
          onClick={() => setDialog({ type: 'add', parentId: null })}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="新建分组"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1.5">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 mx-1 rounded-lg cursor-pointer text-sm transition-colors ${
            selectedGroupId === ALL_ENTRIES
              ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
          onClick={() => selectGroup(ALL_ENTRIES)}
        >
          <FolderOpen size={15} className="shrink-0 text-blue-500" />
          <span>全部条目</span>
        </div>
        {groups.map((g) => renderNode(g, 0))}
      </div>

      {dialog && (
        <PromptDialog
          title={dialog.type === 'add' ? '新建分组' : '重命名分组'}
          label="分组名称"
          initial={dialog.type === 'rename' ? groups.find((g) => g.uuid === dialog.groupId)?.name ?? '' : ''}
          placeholder="输入分组名称"
          onSubmit={(name) => {
            if (dialog.type === 'add') addGroup(dialog.parentId ?? ALL_ENTRIES, name)
            else if (dialog.groupId) renameGroup(dialog.groupId, name)
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="删除分组"
          message={`确定要删除分组「${deleteTarget.name}」吗？分组内的条目也会一并删除。`}
          onConfirm={() => deleteGroup(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </aside>
  )
}

function MenuItem({
  icon,
  label,
  danger,
  onClick
}: {
  icon: JSX.Element
  label: string
  danger?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
