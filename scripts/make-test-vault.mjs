// 生成用于端到端测试的密码库
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

const out = process.argv[2] || 'e2e-test-vault.kdbx'
const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test1234'))
const db = kdbxweb.Kdbx.create(creds, 'E2E测试库')
db.createDefaultGroup()
const root = db.getDefaultGroup()
const group = db.createGroup(root, '测试分组')

const samples = [
  ['GitHub 测试', 'testuser', 'P@ssw0rd123', 'https://github.com/login'],
  ['百度测试', 'baiduuser', 'bd12345678', 'https://www.baidu.com']
]
for (const [title, user, pass, url] of samples) {
  const e = db.createEntry(group)
  e.fields.set('Title', title)
  e.fields.set('UserName', user)
  e.fields.set('Password', kdbxweb.ProtectedValue.fromString(pass))
  e.fields.set('URL', url)
}

const data = await db.save()
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(data))
console.log('测试密码库已生成:', out, '大小', data.byteLength, '字节')
