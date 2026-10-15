import { useMemo } from 'react'
import { FileText } from 'lucide-react'
import { useVault, ALL_ENTRIES } from '../store/vault'
import EntryAvatar from './EntryAvatar'
import { normalizeQuery } from '../lib/pinyin'
import type { EntryMeta, GroupMeta } from '../types'

function subtreeIds(groups: GroupMeta[], id: string): Set<string> {
  const result = new Set<string>()
  const find = (list: GroupMeta[]): GroupMeta | undefined => {
    for (const g of list) {
      if (g.uuid === id) return g
      const r = find(g.children)
      if (r) return r
    }
    return undefined
  }
  const walk = (g: GroupMeta): void => {
    result.add(g.uuid)
    for (const c of g.children) walk(c)
  }
  const target = find(groups)
  if (target) walk(target)
  else result.add(id)
  return result
}

export default function EntryList(): JSX.Element {
  const entries = useVault((s) => s.entries)
  const groups = useVault((s) => s.groups)
  const selectedGroupId = useVault((s) => s.selectedGroupId)
  const selectedEntryId = useVault((s) => s.selectedEntryId)
  const search = useVault((s) => s.search)
  const selectEntry = useVault((s) => s.selectEntry)

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    const ids = selectedGroupId === ALL_ENTRIES ? null : subtreeIds(groups, selectedGroupId)
    return entries.filter((e) => {
      if (ids && !ids.has(e.groupId)) return false
      if (!q) return true
      return e.searchKey.includes(q)
    })
  }, [entries, groups, selectedGroupId, search])

  return (
    <main className="flex-1 min-w-0 flex flex-col bg-slate-50 dark:bg-slate-950">
      <div className="flex items-center justify-between px-4 h-10 border-b border-slate-200 dark:border-slate-800">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          条目 · {filtered.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
            <FileText size={40} className="mb-3 opacity-50" />
            <p className="text-sm">{search ? '没有匹配的条目' : '暂无条目'}</p>
            <p className="text-xs mt-1">{search ? '' : '点击右上角「新建条目」开始'}</p>
          </div>
        ) : (
          filtered.map((e) => (
            <EntryRow key={e.uuid} entry={e} selected={e.uuid === selectedEntryId} onSelect={() => selectEntry(e.uuid)} showGroup={selectedGroupId === ALL_ENTRIES} />
          ))
        )}
      </div>
    </main>
  )
}

function EntryRow({
  entry,
  selected,
  onSelect,
  showGroup
}: {
  entry: EntryMeta
  selected: boolean
  onSelect: () => void
  showGroup: boolean
}): JSX.Element {
  return (
    <div
      onClick={onSelect}
      className={`relative flex items-center gap-3 pl-4 pr-3 py-2.5 cursor-pointer border-b border-slate-100 dark:border-slate-800/60 transition-all ${
        selected
          ? 'bg-blue-50 dark:bg-blue-950/40 shadow-inner'
          : 'hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm'
      }`}
    >
      {selected && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-blue-500" />
      )}
      <EntryAvatar url={entry.url} title={entry.title} size={32} />
      <div className="flex-1 min-w-0">
        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{entry.title || '(无标题)'}</div>
        <div className="truncate text-xs text-slate-400 dark:text-slate-500">
          {entry.username || '—'}
          {showGroup && entry.groupPath.length > 0 && (
            <span className="ml-2 text-slate-300 dark:text-slate-600">{entry.groupPath.join(' / ')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
