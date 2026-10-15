const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
  const clean = input
    .replace(/=+$/g, '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const c of clean) {
    const idx = B32_ALPHABET.indexOf(c)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpConfig {
  secret: string
  period?: number
  digits?: number
  algorithm?: TotpAlgorithm
}

export function parseOtpauthUri(uri: string): TotpConfig | null {
  if (!uri || !uri.startsWith('otpauth://')) return null
  try {
    const url = new URL(uri)
    if (url.protocol !== 'otpauth:') return null
    const secret = url.searchParams.get('secret')
    if (!secret) return null
    const period = Number(url.searchParams.get('period') ?? 30)
    const digits = Number(url.searchParams.get('digits') ?? 6)
    const algorithmRaw = (url.searchParams.get('algorithm') ?? 'SHA1').toUpperCase()
    const algorithm: TotpAlgorithm =
      algorithmRaw === 'SHA256' ? 'SHA256' : algorithmRaw === 'SHA512' ? 'SHA512' : 'SHA1'
    return { secret, period, digits, algorithm }
  } catch {
    return null
  }
}

async function hmac(key: Uint8Array, data: Uint8Array, alg: TotpAlgorithm): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as unknown as BufferSource,
    { name: 'HMAC', hash: { name: alg } },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', cryptoKey, data as unknown as BufferSource)
}

export async function generateTotp(cfg: TotpConfig, nowMs = Date.now()): Promise<string> {
  const period = cfg.period ?? 30
  const digits = cfg.digits ?? 6
  const algorithm = cfg.algorithm ?? 'SHA1'

  const secret = base32Decode(cfg.secret)
  const counter = Math.floor(nowMs / 1000 / period)

  // 64-bit big-endian counter
  const counterBytes = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff
    c = Math.floor(c / 256)
  }

  const sig = new Uint8Array(await hmac(secret, counterBytes, algorithm))
  const offset = sig[sig.length - 1] & 0x0f
  const code =
    (((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff)) %
    Math.pow(10, digits)

  return code.toString().padStart(digits, '0')
}
