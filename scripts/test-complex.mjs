// 复现：带历史记录 + 附件的复杂库，检查保存出的 XML 是否有非法 Base64
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'
import { XMLSerializer } from '@xmldom/xmldom'
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

// 应用内的补丁：强制文本时间
const original = kdbxweb.XmlUtils.setDate
kdbxweb.XmlUtils.setDate = (node, date) => original(node, date, false)

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test'))
const db = kdbxweb.Kdbx.create(creds, 'Test')
db.createDefaultGroup()
db.setVersion(4)

// 1. 带历史的条目（模拟浏览器保存的 pushHistory + 改密码）
const e1 = db.createEntry(db.getDefaultGroup())
e1.fields.set('Title', '有历史')
e1.fields.set('UserName', 'u1')
e1.fields.set('Password', kdbxweb.ProtectedValue.fromString('oldpass'))
e1.fields.set('URL', 'https://example.com')
e1.times.update()
e1.pushHistory()
e1.fields.set('Password', kdbxweb.ProtectedValue.fromString('newpass'))
e1.times.update()

// 2. 带附件的条目
const e2 = db.createEntry(db.getDefaultGroup())
e2.fields.set('Title', '有附件')
e2.fields.set('Password', kdbxweb.ProtectedValue.fromString('p2'))
const binaryData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).buffer
const bin = await db.createBinary(binaryData)
e2.binaries.set('file.bin', bin)
e2.times.update()

const buf = await db.save()
const db2 = await kdbxweb.Kdbx.load(buf, creds, { preserveXml: true })
console.log('版本:', db2.versionMajor + '.' + db2.versionMinor)

const xml = new XMLSerializer().serializeToString(db2.xml)
writeFileSync('E:/Code/harness/safevault/.tmp-complex.xml', xml, 'utf8')

// 检查所有 Value（含历史、附件、Protected）的 Base64 合法性
const values = [...xml.matchAll(/<Value[^>]*>([^<]*)<\/Value>/g)]
let bad = 0
for (const m of values) {
  const v = m[1]
  const tag = m[0].slice(0, 60)
  // Protected 或 Ref 为空的情况特殊
  const isProtected = /Protected="True"/.test(tag)
  const isRef = /Ref=/.test(tag)
  if (isRef) continue
  if (isProtected || /^[A-Za-z0-9+/]+={0,2}$/.test(v) && v.length % 4 === 0) {
    // 合法 base64 或受保护值
  } else if (v.includes('T') || v === '' || /^[\x00-\x7F]+$/.test(v)) {
    // 普通文本
  } else {
    bad++
    console.log('可疑 Value:', tag, '=>', v.slice(0, 60))
  }
}
console.log('Value 总数:', values.length, '可疑:', bad)

// 检查 History 块
const histMatch = xml.match(/<History>[\s\S]*?<\/History>/)
if (histMatch) {
  console.log('=== History 块（前 500 字符） ===')
  console.log(histMatch[0].slice(0, 500))
} else {
  console.log('无 History 块')
}

// 检查 Binary 块
const binMatch = xml.match(/<Binary[^>]*>[\s\S]*?<\/Binary>/)
if (binMatch) {
  console.log('=== Binary 块（前 200 字符） ===')
  console.log(binMatch[0].slice(0, 200))
}
console.log('完整 XML 已保存到 .tmp-complex.xml')
