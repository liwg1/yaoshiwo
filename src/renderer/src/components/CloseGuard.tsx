import { useState } from 'react'
import { Minimize2, Power } from 'lucide-react'
import Modal from './ui/Modal'
import { useVault } from '../store/vault'

export type CloseAction = 'ask' | 'tray' | 'quit'

/**
 * 统一的窗口「关闭」行为：
 * - 设置为「每次询问」（默认）时，点击关闭弹窗询问「放到状态栏」还是「永久关闭」；
 * - 也可以在设置里固定成其中一种，之后点击关闭直接执行、不再打扰。
 * 解锁页和主界面共用同一份设置，行为一致。
 */
export function useCloseGuard(): {
  requestClose: () => void
  dialog: JSX.Element | null
} {
  const closeAction = useVault((s) => s.settings.closeAction)
  const updateSettings = useVault((s) => s.updateSettings)
  const [open, setOpen] = useState(false)
  const [remember, setRemember] = useState(true)

  function requestClose(): void {
    if (closeAction === 'quit') {
      void window.api.quit()
      return
    }
    if (closeAction === 'tray') {
      void window.api.hideWindow()
      return
    }
    setRemember(true)
    setOpen(true)
  }

  function choose(action: 'tray' | 'quit'): void {
    // 勾选「记住」时写回设置，之后可在设置面板里随时改回「每次询问」
    if (remember) updateSettings({ closeAction: action })
    setOpen(false)
    if (action === 'quit') void window.api.quit()
    else void window.api.hideWindow()
  }

  const dialog = open ? (
    <Modal title="关闭 钥匙窝" onClose={() => setOpen(false)} width={430}>
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">请选择关闭方式：</p>
      <div className="space-y-2.5">
        <button
          onClick={() => choose('tray')}
          className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            <Minimize2 size={16} className="text-blue-500 shrink-0" />
            放到状态栏（推荐）
          </span>
          <span className="block mt-1 pl-6 text-xs text-slate-400">
            后台继续运行，浏览器扩展仍可自动填充与保存密码
          </span>
        </button>

        <button
          onClick={() => choose('quit')}
          className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
            <Power size={16} className="text-red-500 shrink-0" />
            永久关闭
          </span>
          <span className="block mt-1 pl-6 text-xs text-slate-400">
            完全退出进程，浏览器扩展将无法自动填充与保存密码
          </span>
        </button>
      </div>

      <label className="flex items-center gap-2 mt-4 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="accent-blue-600"
        />
        记住我的选择（之后可在「设置」里改回每次询问）
      </label>
    </Modal>
  ) : null

  return { requestClose, dialog }
}
