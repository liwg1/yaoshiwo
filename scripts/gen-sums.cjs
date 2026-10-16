// 生成 website/download/SHA256SUMS.txt
//
// 为什么要这个文件：官网提供几十 MB 的安装包下载，用户没法一眼判断文件是不是被替换过。
// 把三个下载文件的 SHA-256 列出来，用户下载后可以自己核对。
//
// 用法：node scripts/gen-sums.cjs
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const DIR = path.join(__dirname, '..', 'website', 'download')
const FILES = ['YaoShiWo-Setup-1.2.0.exe', 'YaoShiWo-portable.exe', 'YaoShiWo-chrome-extension.zip']
const VERSION = '1.2.0'

const lines = [
  `# 钥匙窝 YaoShiWo v${VERSION} 下载文件校验值`,
  '# 用法：Windows 下 certutil -hashfile <文件名> SHA256  （或 PowerShell: Get-FileHash <文件名> -Algorithm SHA256）',
  '# 官网 https://yaoshiwo.cn   源码 https://github.com/liwg1/yaoshiwo',
  ''
]

let missing = 0
for (const name of FILES) {
  const file = path.join(DIR, name)
  if (!fs.existsSync(file)) {
    console.log(`  ✗ 缺少文件：${name}`)
    missing++
    continue
  }
  const buf = fs.readFileSync(file)
  const hash = crypto.createHash('sha256').update(buf).digest('hex')
  lines.push(`${hash}  ${name}  (${buf.length} 字节)`)
  console.log(`  ✓ ${hash}  ${name}  ${buf.length} 字节`)
}

if (missing) {
  console.log(`\n✗ 有 ${missing} 个文件不存在，未写入 SHA256SUMS.txt`)
  process.exit(1)
}

const out = lines.join('\n') + '\n'
fs.writeFileSync(path.join(DIR, 'SHA256SUMS.txt'), out, 'utf8')
console.log(`\n✅ 已写入 website/download/SHA256SUMS.txt（${Buffer.byteLength(out)} 字节）`)
