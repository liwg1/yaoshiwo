// CDP：点击「保存」按钮，触发应用重写文件
const base = 'http://127.0.0.1:9222'

async function getPageTarget() {
  for (let i = 0; i < 30; i++) {
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

console.log(
  '点击保存按钮:',
  await evaluate(`(() => {
    const b = document.querySelector('button[title*="保存"]')
    if (!b) return 'NO_SAVE_BUTTON'
    b.click()
    return 'CLICKED'
  })()`)
)

await new Promise((r) => setTimeout(r, 2500))
console.log('已等待保存完成')
ws.close()
