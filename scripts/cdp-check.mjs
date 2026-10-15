// 通过 Chrome DevTools Protocol 检查渲染进程状态 + favicon 抓取
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
  console.error('未找到页面目标（应用可能未启动渲染进程）')
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

const subtle = await evaluate('typeof crypto.subtle')
const rootChildren = await evaluate("document.getElementById('root')?.children.length ?? -1")
const bodyText = await evaluate('document.body.innerText.slice(0, 300)')

console.log('crypto.subtle 类型:', subtle)
console.log('#root 子节点数:', rootChildren)
console.log('页面文本预览:', JSON.stringify(bodyText))

const faviconTest = await evaluate(`(async () => {
  try {
    const r = await window.api.fetchFavicon('github.com')
    return r && r.data ? ('OK data长度=' + r.data.length) : 'null(无favicon)'
  } catch (e) {
    return 'error=' + e.message
  }
})()`)
console.log('favicon 抓取:', faviconTest)

ws.close()

if (subtle !== 'object') {
  console.error('!! crypto.subtle 不可用')
  process.exit(1)
}
if (rootChildren <= 0) {
  console.error('!! #root 没有子节点，React 未挂载')
  process.exit(1)
}
if (!bodyText.includes('SafeVault')) {
  console.error('!! 页面未渲染出预期内容')
  process.exit(1)
}
console.log('=== 渲染进程验证通过 ===')
