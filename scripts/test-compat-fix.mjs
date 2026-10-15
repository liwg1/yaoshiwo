// 验证兼容性修复：打补丁后，保存的时间应为 ISO 文本、版本应为 4.0
import kdbxweb from 'kdbxweb'
import { argon2d, argon2id } from 'hash-wasm'
import { XMLSerializer } from '@xmldom/xmldom'

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

function makeDb() {
  const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test'))
  const db = kdbxweb.Kdbx.create(creds, 'Test')
  db.createDefaultGroup()
  db.setVersion(4)
  const e = db.createEntry(db.getDefaultGroup())
  e.fields.set('Title', '测试条目')
  e.fields.set('UserName', 'user')
  e.fields.set('Password', kdbxweb.ProtectedValue.fromString('pass123'))
  e.times.update()
  return { db, creds }
}

async function inspect(buf, creds) {
  const db2 = await kdbxweb.Kdbx.load(buf, creds, { preserveXml: true })
  const xml = new XMLSerializer().serializeToString(db2.xml)
  const m = xml.match(/<CreationTime[^>]*>([^<]*)<\/CreationTime>/)
  return { db: db2, time: m ? m[1] : '(未找到)' }
}

// 对照组：不打补丁
{
  const { db, creds } = makeDb()
  const buf = await db.save()
  const { time } = await inspect(buf, creds)
  console.log('对照组(不打补丁) CreationTime:', time.slice(0, 40))
  console.log('  => 是二进制(Base64)?', !time.includes('T'))
}

// 实验组：打补丁（与应用内 forceTextTimeSerialization 一致）
{
  const original = kdbxweb.XmlUtils.setDate
  kdbxweb.XmlUtils.setDate = (node, date) => original(node, date, false)

  const { db, creds } = makeDb()
  const buf = await db.save()
  const { db: db2, time } = await inspect(buf, creds)
  console.log('实验组(打补丁)   版本:', db2.versionMajor + '.' + db2.versionMinor)
  console.log('实验组(打补丁)   CreationTime:', time.slice(0, 40))
  console.log('  => 是文本(ISO)?', time.includes('T'))

  const e2 = db2.getDefaultGroup().entries[0]
  const title = e2.fields.get('Title')
  const pass = e2.fields.get('Password').getText()
  console.log('  数据完整性:', typeof title === 'string' ? title : title.getText(), '/', pass)

  const ok = db2.versionMajor === 4 && db2.versionMinor === 0 && time.includes('T') && pass === 'pass123'
  console.log(ok ? '\n=== 兼容性修复验证通过 ===' : '\n=== 兼容性修复验证失败 ===')
  process.exit(ok ? 0 : 1)
}
