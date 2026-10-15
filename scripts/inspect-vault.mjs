// 检查保存出的 KDBX：版本 + 时间格式 + 是否存在非 Base64 的可疑字段
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'
import { XMLSerializer } from '@xmldom/xmldom'
import { readFileSync, writeFileSync } from 'fs'

kdbxweb.CryptoEngine.setArgon2Impl(
  async (password, salt, memory, iterations, length, parallelism, type) => {
    const opts = {
      password: new Uint8Array(password),
      salt: new Uint8Array(salt),
      iterations,
      parallelism,
      memorySize: Math.max(8, Math.floor(memory / 1024)),
      hashLength: length,
      outputType: 'binary'
    }
    const hash = type === 0 ? await argon2d(opts) : await argon2id(opts)
    return new Uint8Array(hash).buffer
  }
)

const file = process.argv[2]
const password = process.argv[3] || 'test1234'
const buf = readFileSync(file)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password))
const db = await kdbxweb.Kdbx.load(ab, creds, { preserveXml: true })
console.log('版本:', db.versionMajor + '.' + db.versionMinor)

const xml = new XMLSerializer().serializeToString(db.xml)
writeFileSync('E:/Code/harness/safevault/.tmp-inspect.xml', xml, 'utf8')

// 检查时间字段格式
const times = [...xml.matchAll(/<(?:CreationTime|LastModificationTime|LastAccessTime|ExpiryTime|LocationChanged|LastModTime)>([^<]*)<\//g)]
const textCount = times.filter((m) => m[1].includes('T')).length
const binCount = times.length - textCount
console.log(`时间字段: 文本 ${textCount} 个, 二进制 ${binCount} 个`)
if (times.length > 0) console.log('  示例:', times[0][1].slice(0, 50))

// 检查 Protected 值是否为合法 Base64
const protectedVals = [...xml.matchAll(/<Value[^>]*Protected="True"[^>]*>([^<]*)<\/Value>/g)]
let badBase64 = 0
for (const m of protectedVals) {
  const v = m[1]
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(v) || v.length % 4 !== 0) badBase64++
}
console.log(`Protected 值: ${protectedVals.length} 个, 非法 Base64 ${badBase64} 个`)

// 检查 UUID 是否为合法 Base64
const uuids = [...xml.matchAll(/<UUID>([^<]*)<\/UUID>/g)]
let badUuid = 0
for (const m of uuids) {
  if (!/^[A-Za-z0-9+/]{22,24}={0,2}$/.test(m[1])) badUuid++
}
console.log(`UUID: ${uuids.length} 个, 非法 ${badUuid} 个`)

console.log('XML 已保存到 .tmp-inspect.xml，长度', xml.length)
