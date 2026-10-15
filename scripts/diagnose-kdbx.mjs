// 诊断脚本：找出 KDBX 文件里格式异常的时间字段
// 用法: node diagnose-kdbx.mjs "D:\你的目录\数据库.kdbx"
// 说明：密码只在你自己电脑上使用，不会外发；输出仅包含「时间字段」信息，不含账号密码。
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

function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    const stdin = process.stdin
    stdin.resume()
    const isTty = Boolean(stdin.isTTY)
    if (isTty) stdin.setRawMode(true)
    let input = ''
    const finish = (value) => {
      if (isTty) stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      process.stdout.write('\n')
      resolve(value)
    }
    const onData = (chunk) => {
      const c = chunk.toString('utf8')
      if (c === '\n' || c === '\r' || c === '\u0004') finish(input)
      else if (c === '\u0003') process.exit(1)
      else if (c === '\u007f' || c === '\b') input = input.slice(0, -1)
      else input += c
    }
    stdin.on('data', onData)
  })
}

const file = process.argv[2]
if (!file) {
  console.error('用法: node diagnose-kdbx.mjs "路径\\数据库.kdbx"')
  process.exit(1)
}
const password = process.argv[3] || (await askHidden('请输入主密码（不显示）: '))

const buf = readFileSync(file)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
console.log('\n文件:', file)
console.log('大小:', buf.length, '字节')
const ver = buf.readUInt32LE(8)
console.log('KDBX 版本:', (ver >>> 16) + '.' + (ver & 0xffff))

const creds = new kdbxweb.Credentials(kdbxweb.ProtectedValue.fromString(password))
let db
try {
  db = await kdbxweb.Kdbx.load(ab, creds, { preserveXml: true })
} catch (e) {
  console.error('打开失败:', e.message, e.code || '')
  process.exit(1)
}
console.log('✅ 打开成功, 版本:', db.versionMajor + '.' + db.versionMinor)

let xml = db.xml ? new XMLSerializer().serializeToString(db.xml) : await db.saveXml(false)
writeFileSync('E:/Code/harness/safevault/.diag-xml.xml', xml, 'utf8')

// 逐一匹配「叶子」时间元素（不含 <Times> 容器）
const TIME_LEAF =
  'CreationTime|LastModificationTime|LastAccessTime|ExpiryTime|LocationChanged|LastModTime|DeletionTime|SettingsChanged|DatabaseNameChanged|DatabaseDescriptionChanged|DefaultUserNameChanged|MasterKeyChanged|RecycleBinChanged|EntryTemplatesGroupChanged'
const re = new RegExp('<(' + TIME_LEAF + ')>([^<]*)</\\1>', 'g')
let m
let total = 0
const bad = []
const byTag = {}
const byFormat = { iso: 0, base64: 0, empty: 0, bad: 0 }
const base64Samples = []

while ((m = re.exec(xml)) !== null) {
  total++
  const tag = m[1]
  const val = m[2]
  byTag[tag] = (byTag[tag] || 0) + 1

  const isIso = val.indexOf(':') >= 0
  const isB64 = /^[A-Za-z0-9+/]*={0,2}$/.test(val) && val.length % 4 === 0 && val.length > 0
  const isEmpty = val.length === 0

  if (isEmpty) byFormat.empty++
  else if (isIso) byFormat.iso++
  else if (isB64) {
    byFormat.base64++
    if (base64Samples.length < 3) base64Samples.push(`${tag}="${val}"`)
  } else {
    byFormat.bad++
    bad.push({ tag, val, len: val.length })
  }
}

console.log('\n===== 时间字段诊断 =====')
console.log('时间元素总数:', total)
console.log('各字段数量:', JSON.stringify(byTag))
console.log('格式分布:', JSON.stringify(byFormat))
if (base64Samples.length) console.log('二进制(Base64)样例:', base64Samples.join('  '))
console.log('❌ 格式非法数量:', bad.length)
for (const b of bad.slice(0, 25)) {
  console.log(`   [${b.tag}]="${b.val}"  (长度 ${b.len})`)
}

// 空值统计
const emptyRe = new RegExp('<(' + Object.keys(byTag).join('|') + ')\\s*/>', 'g')
console.log('空/自闭合:', [...xml.matchAll(emptyRe)].length)

// 顺带统计 Protected 值 / UUID / Binary 的合法性
const pv = [...xml.matchAll(/<Value[^>]*Protected="True"[^>]*>([^<]*)<\/Value>/g)]
const pvBad = pv.filter((x) => !(/^[A-Za-z0-9+/]*={0,2}$/.test(x[1]) && x[1].length % 4 === 0))
const uu = [...xml.matchAll(/<UUID>([^<]*)<\/UUID>/g)]
const uuBad = uu.filter((x) => !(/^[A-Za-z0-9+/]*={0,2}$/.test(x[1]) && x[1].length % 4 === 0))
const bi = [...xml.matchAll(/<Binary\b[^>]*>([A-Za-z0-9+/=\s]*)<\/Binary>/g)]
const biBad = bi.filter((x) => x[1].trim() && !(/^[A-Za-z0-9+/]*={0,2}$/.test(x[1].trim()) && x[1].trim().length % 4 === 0))

console.log('\n===== 其他 Base64 字段 =====')
console.log(`Protected 值: ${pv.length} 个, 非法 ${pvBad.length}`)
console.log(`UUID: ${uu.length} 个, 非法 ${uuBad.length}`)
console.log(`Binary: ${bi.length} 个, 非法 ${biBad.length}`)

console.log('\nXML 总长度:', xml.length)
if (bad.length > 0) console.log('\n>>> 找到 ❌ 非法时间值，请把上面那段发我 <<<')
else console.log('\n未发现非法时间值')
