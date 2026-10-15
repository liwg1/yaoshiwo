// 通过 CDP 打开设置面板，检查「浏览器扩展」小节是否存在
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

console.log('页面标题:', await evaluate('document.title'))
console.log('是否有搜索框(主界面标志):', await evaluate('!!document.getElementById("global-search")'))

const clicked = await evaluate(`(() => {
  const btn = document.querySelector('button[title="设置"]')
  if (!btn) return 'NO_SETTINGS_BUTTON'
  btn.click()
  return 'CLICKED'
})()`)
console.log('点击设置按钮:', clicked)

await new Promise((r) => setTimeout(r, 1500))

const info = await evaluate(`(() => {
  const h3 = Array.from(document.querySelectorAll('h3')).map((el) => el.textContent.trim())
  const text = document.body.innerText
  return JSON.stringify({
    sections: h3,
    hasExtensionWord: text.indexOf('\\u6d4f\\u89c8\\u5668\\u6269\\u5c55') >= 0,
    hasTokenWord: text.indexOf('\\u8bbf\\u95ee\\u4ee4\\u724c') >= 0,
    hasLoading: text.indexOf('\\u52a0\\u8f7d\\u4e2d') >= 0
  })
})()`)
console.log('设置面板小节:', info)

ws.close()
