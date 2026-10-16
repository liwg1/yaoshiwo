// 打包浏览器扩展为 zip（给官网下载用）
//
// 为什么不用 PowerShell 的 Compress-Archive：Windows PowerShell 5.1 背后的 .NET Framework
// 生成 zip 时条目分隔符写的是反斜杠（如 `icons\icon16.png`），Chrome /  Edge 解压时会把它当成
// 文件名的一部分，用户「加载已解压的扩展程序」就会失败。这里自己写 zip，条目名统一用 `/`。
//
// 用法：node scripts/make-extension-zip.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'chrome-extension')
const OUT = path.join(ROOT, 'website', 'download', 'YaoShiWo-chrome-extension.zip')

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

// ---------- 收集文件 ----------
function walk(dir, base = '') {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = base ? `${base}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, name))
    else out.push({ name, full })
  }
  return out
}

const files = walk(SRC)
if (!files.some((f) => f.name === 'manifest.json')) {
  console.error('✗ chrome-extension/manifest.json 不存在，打包中止')
  process.exit(1)
}

// ---------- 组装 zip ----------
const locals = []
const centrals = []
let offset = 0

for (const file of files) {
  const raw = fs.readFileSync(file.full)
  const nameBuf = Buffer.from(file.name, 'utf8')
  const crc = crc32(raw)
  // 已经是压缩过的图片再 deflate 也没收益，直接 store
  const stored = /\.(png|zip|ico)$/i.test(file.name)
  const body = stored ? raw : zlib.deflateRawSync(raw, { level: 9 })
  const method = stored ? 0 : 8

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0x0800, 6) // UTF-8 文件名
  local.writeUInt16LE(method, 8)
  local.writeUInt16LE(0, 10) // time
  local.writeUInt16LE(0x21, 12) // date (1980-01-01)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(body.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)
  locals.push(local, nameBuf, body)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(method, 10)
  central.writeUInt16LE(0, 12)
  central.writeUInt16LE(0x21, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(body.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt16LE(0, 30) // extra
  central.writeUInt16LE(0, 32) // comment
  central.writeUInt16LE(0, 34) // disk
  central.writeUInt16LE(0, 36) // internal attrs
  central.writeUInt32LE(0, 38) // external attrs
  central.writeUInt32LE(offset, 42)
  centrals.push(central, nameBuf)

  offset += local.length + nameBuf.length + body.length
}

const centralBuf = Buffer.concat(centrals)
const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0)
eocd.writeUInt16LE(0, 4)
eocd.writeUInt16LE(0, 6)
eocd.writeUInt16LE(files.length, 8)
eocd.writeUInt16LE(files.length, 10)
eocd.writeUInt32LE(centralBuf.length, 12)
eocd.writeUInt32LE(offset, 16)
eocd.writeUInt16LE(0, 20)

fs.writeFileSync(OUT, Buffer.concat([...locals, centralBuf, eocd]))

// ---------- 回读校验 ----------
const zip = fs.readFileSync(OUT)
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'))
console.log(`✅ 已生成 website/download/${path.basename(OUT)}（${zip.length} 字节，${files.length} 个文件）`)
console.log(`   扩展版本：${manifest.version}`)
for (const f of files) console.log(`   ${f.name}`)
