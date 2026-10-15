// 诊断：检查 kdbxweb 保存出的 XML 中时间字段的格式
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'
import { writeFileSync } from 'fs'

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

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test'))
const db = kdbxweb.Kdbx.create(creds, 'Test')
db.createDefaultGroup()
const entry = db.createEntry(db.getDefaultGroup())
entry.fields.set('Title', 'TestEntry')
entry.fields.set('UserName', 'user')
entry.fields.set('Password', kdbxweb.ProtectedValue.fromString('pass'))
entry.fields.set('URL', 'https://example.com')
entry.times.update()

console.log('=== 保存后 db 版本 ===')
console.log('versionMajor:', db.versionMajor, 'versionMinor:', db.versionMinor)

const xml = await db.saveXml(true)
writeFileSync('E:/Code/harness/safevault/.tmp-db.xml', xml, 'utf8')
console.log('=== XML 中的时间相关片段 ===')
const lines = xml.split('\n')
for (const line of lines) {
  if (
    /Time|Expires|LocationChanged|LastMod|Creation|Access|Expiry/i.test(line) &&
    /T[0-9]/i.test(line)
  ) {
    console.log('  ' + line.trim())
  }
}
console.log('=== 完整 Times 块（若有） ===')
const m = xml.match(/<Times[\s\S]*?<\/Times>/)
if (m) console.log(m[0].slice(0, 600))
