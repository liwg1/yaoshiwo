// 校验「服务器上的网站文件」和「本地 website/ 目录」是否逐字节一致（sha256 对比）。
//
// 用法：
//   $env:SAFEVAULT_SSH_HOST='你的服务器IP'
//   $env:SAFEVAULT_SSH_PASS='服务器root密码'
//   node scripts/verify-deploy.cjs
//
// 为什么要这个：部署完只看「HTTP 200」是不够的——万一是旧文件、或者上传中断了，
// 页面照样返回 200。用哈希比对才能确认线上跑的确实是你本地这一份。
const { Client } = require('ssh2')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const LOCAL_SITE = path.join(ROOT, 'website')
const HOST = process.env.SAFEVAULT_SSH_HOST
const USER = process.env.SAFEVAULT_SSH_USER || 'root'
const PASS = process.env.SAFEVAULT_SSH_PASS
const WEB_ROOT = process.env.SAFEVAULT_WEB_ROOT || '/var/www/yaoshiwo'

if (!HOST || !PASS) {
  console.error('需要环境变量 SAFEVAULT_SSH_HOST 和 SAFEVAULT_SSH_PASS')
  process.exit(2)
}

const SKIP_DIRS = new Set(['preview'])
const SKIP_FILES = new Set(['.gitignore'])

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(full, base, acc)
    } else if (!SKIP_FILES.has(e.name)) {
      acc.push(rel)
    }
  }
  return acc
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

const conn = new Client()
conn.on('ready', () => {
  const remoteCmd = `cd ${WEB_ROOT} && find . -type f -print0 | xargs -0 sha256sum`
  conn.exec(remoteCmd, (err, stream) => {
    if (err) {
      console.error('远程命令失败：' + err.message)
      conn.end()
      process.exit(1)
    }
    let out = ''
    stream.on('data', (d) => (out += d.toString()))
    stream.stderr.on('data', (d) => (out += d.toString()))
    stream.on('close', () => {
      const remote = new Map()
      for (const line of out.trim().split('\n')) {
        const m = line.match(/^([0-9a-f]{64})\s+\.\/(.+)$/)
        if (m) remote.set(m[2].trim(), m[1])
      }
      const files = walk(LOCAL_SITE).sort()
      let same = 0
      const diffs = []
      const missing = []
      const extra = [...remote.keys()].filter((f) => !files.includes(f))
      console.log('文件'.padEnd(46) + '结果')
      for (const f of files) {
        const l = sha(fs.readFileSync(path.join(LOCAL_SITE, f)))
        const r = remote.get(f)
        if (!r) {
          missing.push(f)
          console.log(('  ' + f).padEnd(46) + '❌ 服务器上没有')
        } else if (r === l) {
          same++
          console.log(('  ' + f).padEnd(46) + '✅ 一致')
        } else {
          diffs.push(f)
          console.log(('  ' + f).padEnd(46) + '❌ 内容不一致')
        }
      }
      console.log('\n本地 ' + files.length + ' 个文件：一致 ' + same + '，不一致 ' + diffs.length + '，缺失 ' + missing.length)
      if (extra.length) console.log('服务器上多出来的文件（本地已删）：' + extra.join(', '))
      if (diffs.length || missing.length) {
        console.log('\n结论：线上不是本地这份，请重新部署：node scripts/deploy-aliyun.cjs deploy')
        process.exitCode = 1
      } else {
        console.log('结论：线上文件与本地逐字节一致 ✅')
      }
      conn.end()
    })
  })
})
conn.on('error', (e) => {
  console.error('连接失败：' + e.message)
  process.exit(1)
})
conn.connect({ host: HOST, username: USER, password: PASS, readyTimeout: 20000 })
