// 穷举所有带时间的结构，逐一校验时间值是否合法（含 ':' 的 ISO 文本 或 合法 Base64）
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

// 应用内的补丁
const originalSetDate = kdbxweb.XmlUtils.setDate
kdbxweb.XmlUtils.setDate = (node, date) => originalSetDate(node, date, false)

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString('test'))
const db = kdbxweb.Kdbx.create(creds, 'TimeTest')
db.createDefaultGroup()
db.setVersion(4)

// 各种 Meta 时间字段
const now = new Date()
const metaFields = [
  'settingsChanged',
  'nameChanged',
  'descChanged',
  'defaultUserChanged',
  'keyChanged',
  'recycleBinChanged',
  'entryTemplatesGroupChanged'
]
for (const f of metaFields) {
  try {
    db.meta[f] = now
  } catch (e) {
    console.log('无法设置 meta.' + f + ':', e.message)
  }
}

// 已删除对象（含删除时间）
try {
  db.addDeletedObject(kdbxweb.KdbxUuid.random(), now)
} catch (e) {
  console.log('addDeletedObject 失败:', e.message)
}

// 回收站
try {
  db.createRecycleBin()
} catch (e) {
  console.log('createRecycleBin 失败:', e.message)
}

// 普通条目
const e = db.createEntry(db.getDefaultGroup())
e.fields.set('Title', 'T')
e.fields.set('Password', kdbxweb.ProtectedValue.fromString('p'))
e.times.update()
e.pushHistory()
e.fields.set('Password', kdbxweb.ProtectedValue.fromString('p2'))
e.times.update()

const buf = await db.save()
const db2 = await kdbxweb.Kdbx.load(buf, creds, { preserveXml: true })
console.log('版本:', db2.versionMajor + '.' + db2.versionMinor)

const xml = new XMLSerializer().serializeToString(db2.xml)
writeFileSync('E:/Code/harness/safevault/.tmp-times.xml', xml, 'utf8')

// 收集所有时间元素
const TIME_TAGS = [
  'CreationTime',
  'LastModificationTime',
  'LastAccessTime',
  'ExpiryTime',
  'LocationChanged',
  'LastModTime',
  'DeletionTime',
  'SettingsChanged',
  'DatabaseNameChanged',
  'DatabaseDescriptionChanged',
  'DefaultUserNameChanged',
  'MasterKeyChanged',
  'RecycleBinChanged',
  'EntryTemplatesGroupChanged'
]
const re = new RegExp('<(' + TIME_TAGS.join('|') + ')>(.*?)</\\1>', 'g')
let m
let total = 0
let bad = 0
const badSamples = []
while ((m = re.exec(xml)) !== null) {
  total++
  const tag = m[1]
  const val = m[2]
  const isIso = val.indexOf(':') >= 0
  const isBase64 = /^[A-Za-z0-9+/]*={0,2}$/.test(val) && val.length % 4 === 0 && val.length > 0
  if (!isIso && !isBase64) {
    bad++
    badSamples.push(`${tag} = "${val}" (len=${val.length})`)
  }
}
console.log(`时间元素总数: ${total}, 非法值: ${bad}`)
for (const s of badSamples.slice(0, 15)) console.log('  ✗', s)

// 也列出所有自闭合或空的时间元素
const emptyRe = new RegExp('<(' + TIME_TAGS.join('|') + ')\\s*/>', 'g')
const empties = [...xml.matchAll(emptyRe)]
console.log('自闭合(空)时间元素:', empties.length, empties.slice(0, 5).map((x) => x[1]).join(', '))
