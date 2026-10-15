// 诊断：判断 CDP 连的是新实例还是旧实例，以及是否真的自动解锁
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

console.log('页面已运行秒数 :', await evaluate('Math.round(performance.now() / 1000)'))
console.log('localStorage键 :', await evaluate('JSON.stringify(Object.keys(localStorage))'))
console.log('主界面搜索框   :', await evaluate('!!document.getElementById("global-search")'))
console.log('解锁界面标志   :', await evaluate('document.body.innerText.indexOf("\\u6253\\u5f00\\u5bc6\\u7801\\u5e93") >= 0'))
console.log('标题栏文件名   :', await evaluate('document.body.innerText.split("\\n").slice(0, 3).join(" / ")'))

ws.close()
