// 启动打包后的真实程序，用 CDP 读窗口标题与页面文字，确认改名后能正常启动、显示「钥匙窝」。
// 用法： node scripts/smoke-app.cjs [exe路径] [调试端口]
// 注意：程序有单实例锁，若用户自己已经开着钥匙窝，本脚本会因拿不到锁而立刻退出（会明确提示）。
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const exe = process.argv[2] || path.join(ROOT, 'release', 'YaoShiWo-portable.exe')
const port = Number(process.argv[3] || 9333)
const base = `http://127.0.0.1:${port}`

if (!fs.existsSync(exe)) {
  console.error('!! 找不到可执行文件：' + exe)
  process.exit(1)
}

const child = spawn(exe, [`--remote-debugging-port=${port}`], {
  detached: false,
  stdio: 'ignore'
})
let exited = null
child.on('exit', (code) => {
  exited = code
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getPageTarget() {
  for (let i = 0; i < 40; i++) {
    if (exited !== null) return { dead: true }
    try {
      const list = await (await fetch(`${base}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return { page }
    } catch {
      /* 还没起来，继续等 */
    }
    await sleep(500)
  }
  return null
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.onopen = () => resolve(ws)
    ws.onerror = () => reject(new Error('WebSocket 连接失败'))
  })
}

function evaluateFactory(ws) {
  let id = 0
  return (expression) =>
    new Promise((resolve) => {
      const msgId = ++id
      const handler = (ev) => {
        const data = JSON.parse(ev.data)
        if (data.id === msgId) {
          ws.removeEventListener('message', handler)
          resolve(data.result?.result?.value ?? data.result)
        }
      }
      ws.addEventListener('message', handler)
      ws.send(
        JSON.stringify({
          id: msgId,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true }
        })
      )
    })
}

function kill() {
  try {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch {
    /* ignore */
  }
}

;(async () => {
  console.log('启动：' + exe)
  const found = await getPageTarget()

  if (found && found.dead) {
    console.error('!! 进程启动后立刻退出了（exit=' + exited + '）')
    console.error('   最常见原因：已经有一个钥匙窝在运行（单实例锁），或主进程启动时抛错。')
    process.exit(1)
  }
  if (!found || !found.page) {
    console.error('!! 等不到渲染进程（应用可能没起来）')
    kill()
    process.exit(1)
  }

  const ws = await connect(found.page.webSocketDebuggerUrl)
  const evaluate = evaluateFactory(ws)

  const title = await evaluate('document.title')
  const body = await evaluate('document.body.innerText.replace(/\\s+/g, " ").slice(0, 400)')
  const rootChildren = await evaluate("document.getElementById('root')?.children.length ?? -1")
  const hasApi = await evaluate('typeof window.api')
  const version = await evaluate('window.api.getVersion()')
  const userData = await evaluate('navigator.userAgent')
  ws.close()

  console.log('窗口标题:', JSON.stringify(title))
  console.log('#root 子节点:', rootChildren)
  console.log('window.api:', hasApi)
  console.log('版本号:', JSON.stringify(version))
  console.log('页面文字:', JSON.stringify(body))
  console.log('UA 片段:', String(userData).slice(0, 80))

  const problems = []
  if (rootChildren <= 0) problems.push('React 未挂载')
  if (hasApi !== 'object' && hasApi !== 'function') problems.push('preload 未注入 window.api')
  if (String(version) !== '1.2.0') problems.push(`版本号不是 1.2.0（实际 ${version}）`)
  if (!String(body).includes('钥匙窝')) problems.push('解锁页没有出现「钥匙窝」')
  if (String(body).includes('SafeVault')) problems.push('页面里仍残留 SafeVault')

  kill()
  await sleep(800)

  if (problems.length) {
    console.error('!! 冒烟测试未通过：')
    for (const p of problems) console.error('   · ' + p)
    process.exit(1)
  }
  console.log('=== 冒烟测试通过 ===')
})()
