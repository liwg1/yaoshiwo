// 端到端：自动解锁测试库 → 打开设置 → 检查扩展小节位置与令牌
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

// 1. 点击「最近使用」里的测试库
console.log(
  '1) 点击最近使用的测试库:',
  await evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find((x) => x.textContent.indexOf(${JSON.stringify(VAULT_NAME)}) >= 0)
    if (!b) return 'NOT_FOUND'
    b.click()
    return 'CLICKED'
  })()`)
)

await sleep(800)

// 2. 填入主密码
console.log(
  '2) 填入主密码:',
  await evaluate(`(() => {
    const input = document.querySelector('input[type="password"]')
    if (!input) return 'NO_PASSWORD_INPUT'
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(PASSWORD)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return 'FILLED'
  })()`)
)

await sleep(300)

// 3. 点击解锁
console.log(
  '3) 点击解锁按钮:',
  await evaluate(`(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find((x) => x.textContent.trim() === '\\u89e3\\u9501')
    if (!b) return 'NO_UNLOCK_BUTTON'
    b.click()
    return 'CLICKED'
  })()`)
)

await sleep(3500)

// 4. 是否已解锁
const unlocked = await evaluate('!!document.getElementById("global-search")')
console.log('4) 解锁成功:', unlocked)

if (!unlocked) {
  console.log('   当前界面:', await evaluate('document.body.innerText.slice(0, 150)'))
  ws.close()
  process.exit(1)
}

// 5. 打开设置
console.log(
  '5) 点击设置按钮:',
  await evaluate(`(() => {
    const b = document.querySelector('button[title="\\u8bbe\\u7f6e"]')
    if (!b) return 'NO_SETTINGS_BUTTON'
    b.click()
    return 'CLICKED'
  })()`)
)

await sleep(1500)

// 6. 检查小节顺序与令牌
const report = await evaluate(`(() => {
  const sections = Array.from(document.querySelectorAll('h3')).map((el) => el.textContent.trim())
  const modal = document.querySelector('.animate-pop-in')
  const tokenEl = modal ? Array.from(modal.querySelectorAll('div')).find((d) => {
    const t = (d.textContent || '').trim()
    return t.length > 20 && /^[•a-f0-9]+$/.test(t)
  }) : null
  return JSON.stringify({
    sections,
    firstSection: sections[0] || null,
    hasTokenBox: !!tokenEl,
    tokenBoxPreview: tokenEl ? tokenEl.textContent.trim().slice(0, 12) + '...' : null
  })
})()`)
console.log('6) 设置面板:', report)

ws.close()
