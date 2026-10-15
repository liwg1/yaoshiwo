// 在服务器上批量执行只读检查命令。
//
// 为什么要有这个：在 PowerShell 里用 node -e 拼带引号、带 $ 的远程命令，
// 转义会把人逼疯（PowerShell 会抢先解释一遍）。把命令写进文件再执行，一次就干净。
//
// 用法：
//   $env:SAFEVAULT_SSH_HOST='服务器IP'
//   $env:SAFEVAULT_SSH_PASS='密码'
//   node scripts/ssh-run.cjs scripts/.ssh-checks.txt
//
// 命令文件格式（UTF-8）：每行 `标签 | shell 命令`，以 # 开头的行是注释，空行忽略。
const { Client } = require('ssh2')
const fs = require('node:fs')

const HOST = process.env.SAFEVAULT_SSH_HOST
const USER = process.env.SAFEVAULT_SSH_USER || 'root'
const PASS = process.env.SAFEVAULT_SSH_PASS
const file = process.argv[2]

if (!HOST || !PASS) {
  console.error('需要环境变量 SAFEVAULT_SSH_HOST 和 SAFEVAULT_SSH_PASS')
  process.exit(2)
}
if (!file || !fs.existsSync(file)) {
  console.error('用法：node scripts/ssh-run.cjs <命令文件>（每行：标签 | 命令）')
  process.exit(2)
}

const jobs = fs
  .readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
  .map((l) => {
    const i = l.indexOf('|')
    return i === -1 ? { label: l, cmd: l } : { label: l.slice(0, i).trim(), cmd: l.slice(i + 1).trim() }
  })

const conn = new Client()
conn.on('ready', async () => {
  for (const job of jobs) {
    const out = await new Promise((resolve) => {
      conn.exec(job.cmd, (err, stream) => {
        if (err) return resolve('exec 出错：' + err.message)
        let o = ''
        stream.on('data', (d) => (o += d.toString()))
        stream.stderr.on('data', (d) => (o += d.toString()))
        stream.on('close', () => resolve(o.trim()))
      })
    })
    console.log(`\n— ${job.label} —\n${out || '(没有输出)'}`)
  }
  conn.end()
})
conn.on('error', (e) => {
  console.error('连接失败：' + e.message)
  process.exit(1)
})
conn.connect({ host: HOST, username: USER, password: PASS, readyTimeout: 20000 })
