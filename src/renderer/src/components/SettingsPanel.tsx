import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor, Copy, Check, RefreshCw, Eye, EyeOff, Puzzle, Download } from 'lucide-react'
import Modal from './ui/Modal'
import { useVault } from '../store/vault'

interface ExtensionConfig {
  port: number
  token: string
  enabled: boolean
  running: boolean
}

export default function SettingsPanel(): JSX.Element {
  const settings = useVault((s) => s.settings)
  const setTheme = useVault((s) => s.setTheme)
  const setFontScale = useVault((s) => s.setFontScale)
  const updateSettings = useVault((s) => s.updateSettings)
  const setSettingsOpen = useVault((s) => s.setSettingsOpen)

  return (
    <Modal title="设置" onClose={() => setSettingsOpen(false)} width={520}>
      <div className="space-y-6">
        <ExtensionSection />

        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2.5">外观主题</h3>
          <div className="grid grid-cols-3 gap-2">
            <ThemeOption
              active={settings.theme === 'light'}
              label="浅色"
              icon={<Sun size={18} />}
              onClick={() => setTheme('light')}
            />
            <ThemeOption
              active={settings.theme === 'dark'}
              label="深色"
              icon={<Moon size={18} />}
              onClick={() => setTheme('dark')}
            />
            <ThemeOption
              active={settings.theme === 'system'}
              label="跟随系统"
              icon={<Monitor size={18} />}
              onClick={() => setTheme('system')}
            />
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">字体大小</h3>
            <span className="text-xs text-slate-500">{Math.round(settings.fontScale * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.85}
            max={1.6}
            step={0.05}
            value={settings.fontScale}
            onChange={(e) => setFontScale(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>小</span>
            <button onClick={() => setFontScale(1)} className="hover:text-blue-600">
              重置为 100%
            </button>
            <span>大</span>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">自动锁定</h3>
          <Select
            value={settings.autoLockMinutes}
            onChange={(v) => updateSettings({ autoLockMinutes: v })}
            options={[
              { value: 0, label: '从不（推荐，浏览器扩展可一直自动填充）' },
              { value: 1, label: '1 分钟' },
              { value: 3, label: '3 分钟' },
              { value: 5, label: '5 分钟' },
              { value: 10, label: '10 分钟' },
              { value: 15, label: '15 分钟' },
              { value: 30, label: '30 分钟' },
              { value: 60, label: '60 分钟' }
            ]}
          />
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            密码库一旦锁定，浏览器扩展将无法自动填充与保存密码。默认「从不」自动锁定，
            只有你主动点「锁定」或使用托盘菜单锁定才会锁上。
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">
            点击关闭按钮时
          </h3>
          <Select
            value={settings.closeAction === 'ask' ? 0 : settings.closeAction === 'tray' ? 1 : 2}
            onChange={(v) =>
              updateSettings({ closeAction: v === 0 ? 'ask' : v === 1 ? 'tray' : 'quit' })
            }
            options={[
              { value: 0, label: '每次询问（推荐）' },
              { value: 1, label: '放到状态栏，后台继续运行' },
              { value: 2, label: '永久关闭程序' }
            ]}
          />
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            放到状态栏时程序不会退出，浏览器扩展仍可自动填充与保存密码；
            也可以在这里随时改回「每次询问」。
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">剪贴板自动清除</h3>
          <Select
            value={settings.clipboardClearSeconds}
            onChange={(v) => updateSettings({ clipboardClearSeconds: v })}
            options={[
              { value: 10, label: '10 秒' },
              { value: 20, label: '20 秒' },
              { value: 30, label: '30 秒' },
              { value: 60, label: '60 秒' },
              { value: 120, label: '120 秒' },
              { value: 0, label: '不清除' }
            ]}
          />
        </section>
        <MaintenanceSection />
        <VersionLine />
      </div>
    </Modal>
  )
}

/** 面板底部显示当前版本号，方便确认装的是哪一个构建 */
function VersionLine(): JSX.Element {
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.api.getVersion().then(setVersion)
  }, [])
  return (
    <p className="pt-1 text-center text-[11px] text-slate-300 dark:text-slate-600">
      钥匙窝{version ? ` ${version}` : ''}
    </p>
  )
}

/** 维护：清理数据库里冗余的密码历史快照 */
function MaintenanceSection(): JSX.Element {
  const cleanupHistory = useVault((s) => s.cleanupHistory)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function run(): Promise<void> {
    setConfirming(false)
    setBusy(true)
    try {
      await cleanupHistory()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2">维护</h3>
      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          清理每个条目里「密码没有变化」和「密码重复」的历史快照，让更新历史只留下真正换过的密码。
          清理前会自动把数据库备份成 <code className="selectable">.bak-日期时间</code> 文件，随时可以还原。
        </p>
        {confirming ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => void run()}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
            >
              确定清理
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
            >
              取消
            </button>
            <span className="text-[11px] text-slate-400">清理后会立即保存数据库</span>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="mt-3 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 hover:ring-red-300 dark:hover:ring-red-800 text-xs text-slate-700 dark:text-slate-200 disabled:opacity-50 transition-all"
          >
            {busy ? '正在清理…' : '清理重复的密码历史'}
          </button>
        )}
      </div>
    </section>
  )
}

function ExtensionSection(): JSX.Element {
  const [config, setConfig] = useState<ExtensionConfig | null>(null)
  const [showToken, setShowToken] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void window.api.getExtensionConfig().then(setConfig)
  }, [])

  async function toggle(): Promise<void> {
    if (!config) return
    setConfig(await window.api.setExtensionEnabled(!config.enabled))
  }

  async function regen(): Promise<void> {
    setConfig(await window.api.regenerateToken())
  }

  async function copyToken(): Promise<void> {
    if (!config) return
    await window.api.clipboardWrite(config.token, 0)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function openDownload(): Promise<void> {
    await window.api.openExternal('https://www.yaoshiwo.cn/download/YaoShiWo-chrome-extension.zip')
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-1.5">
        <Puzzle size={15} className="text-blue-500" />
        浏览器扩展（自动填充）
      </h3>
      {!config ? (
        <p className="text-xs text-slate-400">加载中…</p>
      ) : (
        <div className="space-y-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 dark:text-slate-400">本地服务状态</span>
            <button
              onClick={() => void toggle()}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                config.enabled
                  ? 'bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-400'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}
            >
              {config.enabled ? '已启用' : '已停用'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">监听端口</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">{config.port}</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400">访问令牌</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowToken((v) => !v)}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title={showToken ? '隐藏' : '显示'}
                >
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  onClick={() => void copyToken()}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="复制令牌"
                >
                  {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                </button>
                <button
                  onClick={() => void regen()}
                  className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="重新生成令牌"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>
            <div className="font-mono text-[11px] break-all rounded-lg bg-white dark:bg-slate-900 px-2.5 py-2 text-slate-700 dark:text-slate-300 selectable border border-slate-200 dark:border-slate-700">
              {showToken ? config.token : '•'.repeat(Math.min(config.token.length, 40))}
            </div>
          </div>

          <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">装到浏览器：四步</span>
              <button
                onClick={() => void openDownload()}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
              >
                <Download size={12} />
                下载扩展包
              </button>
            </div>
            <ol className="space-y-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 list-none">
              <li>
                <b className="text-slate-700 dark:text-slate-300">① 下载并解压</b>：点上面「下载扩展包」得到{' '}
                <span className="font-mono">YaoShiWo-chrome-extension.zip</span>，解压到一个固定目录。
                解压后这个文件夹不要删、不要挪——浏览器是直接按这个路径加载的。
              </li>
              <li>
                <b className="text-slate-700 dark:text-slate-300">② 打开扩展管理页</b>：Chrome 地址栏输入{' '}
                <span className="font-mono">chrome://extensions</span>（Edge 输入 <span className="font-mono">edge://extensions</span>），
                把右上角的「开发者模式」开关打开。
              </li>
              <li>
                <b className="text-slate-700 dark:text-slate-300">③ 加载</b>：点「加载已解压的扩展程序」，
                选第 ① 步解压出来的文件夹（里面能看到 <span className="font-mono">manifest.json</span>）。
              </li>
              <li>
                <b className="text-slate-700 dark:text-slate-300">④ 配对</b>：点浏览器工具栏上的钥匙窝图标，
                把上面的访问令牌粘进输入框、点保存；端口保持 <span className="font-mono">{config.port}</span> 即可。
              </li>
            </ol>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
            装好后：登录页的账号与密码框旁会出现一个小盾牌图标，点一下即可填充。
            <b className="text-slate-500 dark:text-slate-400">密码库锁定时扩展取不到任何凭证</b>；重新生成令牌后，要在扩展弹窗里重新粘贴一次。
            换 Chrome 用户、重装浏览器、或把解压目录挪走之后，第 ②③ 步要重做一遍。
          </p>
        </div>
      )}
    </section>
  )
}

function ThemeOption({
  active,
  label,
  icon,
  onClick
}: {
  active: boolean
  label: string
  icon: JSX.Element
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition-colors ${
        active
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  )
}

function Select({
  value,
  onChange,
  options
}: {
  value: number
  onChange: (v: number) => void
  options: { value: number; label: string }[]
}): JSX.Element {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
