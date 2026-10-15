// 生成与 SafeVault 应用保存格式完全一致的测试库（KDBX 4.0 + 文本时间 + 补丁）
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname } from 'path'

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

// ★ 应用内的兼容性补丁：强制所有时间为二进制(Base64)
const originalSetDate = kdbxweb.XmlUtils.setDate
kdbxweb.XmlUtils.setDate = (node, date) => originalSetDate(node, date, true)

const out = process.argv[2]
const usePatch = process.argv[3] !== 'nopatch'

if (!usePatch) {
  kdbxweb.XmlUtils.setDate = originalSetDate
}

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test1234'))
const db = kdbxweb.Kdbx.create(creds, 'CompatTest')
db.createDefaultGroup()
db.setVersion(4)

const group = db.createGroup(db.getDefaultGroup(), '测试分组')
const samples = [
  ['GitHub', 'user1', 'P@ssw0rd123', 'https://github.com/login'],
  ['百度', 'user2', 'bd12345678', 'https://www.baidu.com'],
  ['中文标题测试', 'user3', 'pw3', 'https://example.com']
]
for (const [title, user, pass, url] of samples) {
  const e = db.createEntry(group)
  e.fields.set('Title', title)
  e.fields.set('UserName', user)
  e.fields.set('Password', kdbxweb.ProtectedValue.fromString(pass))
  e.fields.set('URL', url)
  e.times.update()
}

// 带历史的条目（模拟浏览器保存更新）
const e4 = db.createEntry(group)
e4.fields.set('Title', '带历史')
e4.fields.set('UserName', 'hist')
e4.fields.set('Password', kdbxweb.ProtectedValue.fromString('old'))
e4.times.update()
e4.pushHistory()
e4.fields.set('Password', kdbxweb.ProtectedValue.fromString('new'))
e4.times.update()

const data = await db.save()
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(data))
console.log(`已生成测试库 (${usePatch ? '带补丁=应用格式' : '无补丁'}):`, out, data.byteLength, '字节')
