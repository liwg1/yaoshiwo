import { CryptoEngine } from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'

let initialized = false

/**
 * kdbxweb 不内置 Argon2，需要手动注入实现。
 * Argon2Type: 0 = Argon2d, 2 = Argon2id（kdbxweb 不支持 Argon2i）。
 * memory 单位为字节，hash-wasm 需要 KiB。
 */
export function initArgon2(): void {
  if (initialized) return
  CryptoEngine.setArgon2Impl(
    async (password, salt, memory, iterations, length, parallelism, type) => {
      const opts = {
        password: new Uint8Array(password),
        salt: new Uint8Array(salt),
        iterations,
        parallelism,
        memorySize: Math.max(8, Math.floor(memory / 1024)),
        hashLength: length,
        outputType: 'binary' as const
      }
      const hash = type === 0 ? await argon2d(opts) : await argon2id(opts)
      return new Uint8Array(hash as Uint8Array).buffer
    }
  )
  initialized = true
}
