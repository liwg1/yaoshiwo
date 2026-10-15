import { useEffect, useState } from 'react'
import { RefreshCw, Copy, Check } from 'lucide-react'
import Modal from './ui/Modal'
import { useVault } from '../store/vault'
import { generatePassword, passwordStrength } from '../lib/generator'

export default function PasswordGenerator(): JSX.Element {
  const generator = useVault((s) => s.settings.generator)
  const updateGenerator = useVault((s) => s.updateGenerator)
  const copyToClipboard = useVault((s) => s.copyToClipboard)
  const setGeneratorOpen = useVault((s) => s.setGeneratorOpen)

  const [pw, setPw] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setPw(generatePassword(generator))
  }, [generator])

  const strength = passwordStrength(pw)

  async function copy(): Promise<void> {
    await copyToClipboard(pw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const checks = [
    { key: 'upper' as const, label: '大写字母 (A-Z)' },
    { key: 'lower' as const, label: '小写字母 (a-z)' },
    { key: 'digits' as const, label: '数字 (0-9)' },
    { key: 'symbols' as const, label: '符号 (!@#$...)' }
  ]

  return (
    <Modal title="密码生成器" onClose={() => setGeneratorOpen(false)} width={440}>
      <div className="space-y-4">
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3">
          <div className="font-mono text-base text-slate-900 dark:text-slate-100 break-all selectable leading-relaxed">{pw}</div>
          <div className="mt-2.5 flex items-center gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-1.5 flex-1 rounded-full transition-colors"
                style={{ background: i <= strength.score ? strength.color : '#e2e8f0' }}
              />
            ))}
            <span className="text-xs ml-1" style={{ color: strength.color }}>
              {strength.label}
            </span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 mb-1">
            <span>长度</span>
            <span className="font-medium">{generator.length}</span>
          </div>
          <input
            type="range"
            min={4}
            max={64}
            value={generator.length}
            onChange={(e) => updateGenerator({ length: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
        </div>

        <div className="space-y-2">
          {checks.map((c) => (
            <label key={c.key} className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={generator[c.key]}
                onChange={(e) => updateGenerator({ [c.key]: e.target.checked })}
                className="w-4 h-4 accent-blue-600"
              />
              {c.label}
            </label>
          ))}
          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={generator.excludeAmbiguous}
              onChange={(e) => updateGenerator({ excludeAmbiguous: e.target.checked })}
              className="w-4 h-4 accent-blue-600"
            />
            排除易混淆字符 (I l 1 O 0)
          </label>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setPw(generatePassword(generator))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw size={15} />
            重新生成
          </button>
          <button
            onClick={() => void copy()}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? '已复制' : '复制密码'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
