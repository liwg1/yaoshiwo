// 运行时检查：预加载 API 是否已注入扩展相关方法
const base = 'http://127.0.0.1:9222'

async function getPageTarget() {
  for (let i = 0; i < 20; i++) {
    try {
      const list = await (await fetch(`${base}/json`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

const page = await getPageTarget()
if (!page) {
  console.error('未找到页面目标')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = () => reject(new Error('WebSocket 连接失败'))
})

let id = 0
function evaluate(expression) {
  return new Promise((resolve) => {
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

console.log('window.api 存在:', await evaluate('typeof window.api'))
console.log('getExtensionConfig 类型:', await evaluate('typeof window.api?.getExtensionConfig'))
console.log(
  '调用结果:',
  await evaluate(`(async () => {
    try {
      if (typeof window.api?.getExtensionConfig !== 'function') return 'FUNCTION_MISSING'
      const cfg = await window.api.getExtensionConfig()
      return 'OK port=' + cfg.port + ' enabled=' + cfg.enabled + ' running=' + cfg.running + ' tokenLength=' + String(cfg.token || '').length
    } catch (e) {
      return 'ERROR: ' + e.message
    }
  })()`)
)

const bodyText = await evaluate('document.body.innerText.slice(0, 60)')
console.log('当前界面:', JSON.stringify(bodyText))

ws.close()
