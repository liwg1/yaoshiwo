// 端到端：自动解锁测试密码库
const base = 'http://127.0.0.1:9222'
const VAULT_NAME = process.argv[2] || 'e2e-test-vault.kdbx'
const PASSWORD = process.argv[3] || 'test1234'

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('页面已运行秒数:', await evaluate('Math.round(performance.now()/1000)'))

const clicked = await evaluate(`(() => {
  const btns = Array.from(document.querySelectorAll('button'))
  const b = btns.find((x) => x.textContent.indexOf(${JSON.stringify(VAULT_NAME)}) >= 0)
  if (!b) return 'NOT_FOUND: ' + btns.map((x) => x.textContent.slice(0, 24)).join(' | ')
  b.click()
  return 'CLICKED'
})()`)
console.log('1) 点击最近使用的测试库:', clicked)
await sleep(800)

console.log(
  '2) 填入主密码:',
  await evaluate(`(() => {
    const input = document.querySelector('input[type="password"]')
    if (!input) return 'NO_INPUT'
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(PASSWORD)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return 'FILLED'
  })()`)
)
await sleep(300)

console.log(
  '3) 点击解锁:',
  await evaluate(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === '\\u89e3\\u9501')
    if (!b) return 'NO_BUTTON'
    b.click()
    return 'CLICKED'
  })()`)
)
await sleep(3500)

const unlocked = await evaluate('!!document.getElementById("global-search")')
console.log('4) 解锁结果:', unlocked ? '成功' : '失败')
if (!unlocked) {
  console.log('   界面:', await evaluate('document.body.innerText.slice(0, 200)'))
}
ws.close()
process.exit(unlocked ? 0 : 1)
