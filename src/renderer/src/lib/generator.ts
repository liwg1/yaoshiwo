import type { GeneratorSettings } from '../types'

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~'

export function generatePassword(opts: GeneratorSettings): string {
  let upper = opts.upper ? UPPER : ''
  let lower = opts.lower ? LOWER : ''
  let digits = opts.digits ? DIGITS : ''
  let symbols = opts.symbols ? SYMBOLS : ''

  if (opts.excludeAmbiguous) {
    upper = upper.replace(/[IlO]/g, '')
    lower = lower.replace(/[lo]/g, '')
    digits = digits.replace(/[01]/g, '')
    symbols = symbols.replace(/[|`'"\\]/g, '')
  }

  const pool = upper + lower + digits + symbols
  const len = Math.max(0, Math.floor(opts.length))
  if (!pool || len === 0) return ''

  const rand = new Uint32Array(len)
  crypto.getRandomValues(rand)

  const chars: string[] = []
  for (let i = 0; i < len; i++) {
    chars.push(pool[rand[i] % pool.length])
  }

  // 确保每个已选字符集至少出现一次（若长度允许）
  const sets: string[] = []
  if (upper) sets.push(upper)
  if (lower) sets.push(lower)
  if (digits) sets.push(digits)
  if (symbols) sets.push(symbols)

  if (sets.length > 0 && len >= sets.length) {
    for (let i = 0; i < sets.length; i++) {
      const s = sets[i]
      chars[i] = s[rand[len + i] % s.length]
    }
    // 打乱
    for (let i = chars.length - 1; i > 0; i--) {
      const j = rand[(i * 2) % rand.length] % (i + 1)
      ;[chars[i], chars[j]] = [chars[j], chars[i]]
    }
  }

  return chars.join('')
}

export interface StrengthResult {
  score: number // 0-4
  label: string
  color: string
}

export function passwordStrength(pw: string): StrengthResult {
  if (!pw) return { score: 0, label: '空', color: '#64748b' }

  let pool = 0
  if (/[a-z]/.test(pw)) pool += 26
  if (/[A-Z]/.test(pw)) pool += 26
  if (/[0-9]/.test(pw)) pool += 10
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33

  const entropy = pw.length * Math.log2(Math.max(pool, 1))

  if (entropy < 28) return { score: 1, label: '弱', color: '#ef4444' }
  if (entropy < 45) return { score: 2, label: '一般', color: '#f59e0b' }
  if (entropy < 70) return { score: 3, label: '强', color: '#84cc16' }
  return { score: 4, label: '很强', color: '#22c55e' }
}
