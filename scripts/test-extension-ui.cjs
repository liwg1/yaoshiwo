// 扩展 UI 自动化自检（不需要人看图：全部用几何测量 + 计算样式来断言）
//
// 背景：模型没有视觉能力，界面靠肉眼确认不了，所以把「图标是否对齐」「选中项是否以账号为主」
// 这类问题变成可断言的数字。
//
// 用法：node node_modules/electron/cli.js scripts/test-extension-ui.cjs
//
// 检查项：
//   1) 用户名框与密码框宽度/高度故意做得不一样时，两个蓝色钥匙图标是否落在同一条竖直线上
//   2) 每个图标是否在自己输入框的垂直中线上
//   3) 下拉菜单主行是否为「用户名」（加粗），且同标题的条目不再重复显示网站地址
//   4) 标题各不相同时，副行是否补充显示标题
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const CONTENT_JS = fs.readFileSync(
  path.join(__dirname, '..', 'chrome-extension', 'content.js'),
  'utf8'
)

const ICON_SIZE = 22
const ICON_INSET = 5

// 故意刁难：用户名框更窄更矮，密码框更宽更高
const PAGE = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>登录 - 测试页</title>
<style>
  body { margin: 40px; font-family: 'Microsoft YaHei', sans-serif; }
  .row { margin-bottom: 14px; }
  input { border: 1px solid #cbd5e1; border-radius: 6px; padding: 0 10px; font-size: 14px; }
  #username { width: 220px; height: 30px; }
  #password { width: 300px; height: 38px; }
</style></head><body>
<h1>登录</h1>
<form id="login">
  <div class="row"><input id="username" name="username" type="text" placeholder="用户名/邮箱"></div>
  <div class="row"><input id="password" name="password" type="password" placeholder="密码"></div>
  <button type="submit">登录</button>
</form>
</body></html>`

const pageUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(PAGE)

app.on('window-all-closed', () => {})

const failures = []
const notes = []

function check(ok, label, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`)
  if (!ok) failures.push(label + (detail ? '（' + detail + '）' : ''))
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 注意：Electron 的 window.chrome 可能是只读/不可扩展的，直接赋值会静默失败或抛错，
// 所以这里用 defineProperty 兜底，并把失败原因回传而不是让整段脚本炸掉。
const STUB = `(() => {
  window.__matches = __MATCHES__;
  const runtime = {
    lastError: null,
    onMessage: { addListener: () => {}, removeListener: () => {} },
    sendMessage: (msg, cb) => {
      if (msg && msg.type === 'query') return cb({ ok: true, data: { matches: window.__matches } })
      if (msg && msg.type === 'takePending') return cb({ ok: true, data: null })
      return cb({ ok: true, data: {} })
    }
  };
  try {
    Object.defineProperty(window, 'chrome', { value: { runtime }, configurable: true, writable: true })
  } catch (e) {
    try { window.chrome = { runtime } } catch (e2) { return 'STUB_FAIL: ' + e2.message }
  }
  return (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) ? 'OK' : 'STUB_MISSING'
})()`

async function inject(win, matches) {
  await win.loadURL(pageUrl)
  const stubResult = await win.webContents.executeJavaScript(
    STUB.replace('__MATCHES__', JSON.stringify(matches))
  )
  if (stubResult !== 'OK') {
    check(false, '注入 chrome.runtime 桩失败', String(stubResult))
  }
  try {
    await win.webContents.executeJavaScript(CONTENT_JS)
  } catch (e) {
    check(false, '注入 content.js 失败', e.message)
  }
  await wait(900)
}

async function measure(win) {
  return win.webContents.executeJavaScript(`(() => {
    const inputs = Array.from(document.querySelectorAll('input')).map((i) => {
      const r = i.getBoundingClientRect()
      return { id: i.id, type: i.type, left: r.left, right: r.right, top: r.top, height: r.height, cy: r.top + r.height / 2 }
    })
    const hosts = Array.from(document.querySelectorAll('[data-safevault="anchor"]')).map((h) => {
      const r = h.getBoundingClientRect()
      const btn = h.shadowRoot && h.shadowRoot.querySelector('button')
      const br = btn ? btn.getBoundingClientRect() : null
      return {
        left: parseFloat(h.style.left),
        top: parseFloat(h.style.top),
        display: h.style.display,
        hasShadowButton: !!btn,
        iconSize: br ? [Math.round(br.width), Math.round(br.height)] : null,
        // 宿主的包围盒是 0×0 的定位锚点，垂直中线要用真正的图标按钮来量
        cy: br ? br.top + br.height / 2 : r.top + r.height / 2
      }
    })
    return { inputs, hosts }
  })()`)
}

async function clickAnchor(win) {
  try {
    await win.webContents.executeJavaScript(
      `document.querySelector('[data-safevault="anchor"]').shadowRoot.querySelector('button').click(); true`
    )
  } catch (e) {
    check(false, '点击图标失败', e.message)
  }
  await wait(500)
}

async function readMenu(win) {
  return win.webContents.executeJavaScript(`(() => {
    const m = document.querySelector('[data-safevault="menu"]')
    if (!m || !m.shadowRoot) return { open: false }
    const sr = m.shadowRoot
    const head = sr.querySelector('.head')
    const items = Array.from(sr.querySelectorAll('.item')).map((it) => {
      const p = it.querySelector('.acct')
      const s = it.querySelector('.sub')
      const cs = p ? getComputedStyle(p) : null
      return {
        primary: p ? p.textContent : null,
        weight: cs ? cs.fontWeight : null,
        fontSize: cs ? cs.fontSize : null,
        noUser: p ? p.classList.contains('empty') : null,
        sub: s ? s.textContent : null,
        rowHasHostname: /yaoshiwo|测试页|登录/.test(it.textContent || '')
      }
    })
    return { open: true, head: head ? head.textContent : null, items }
  })()`)
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: { backgroundThrottling: false }
  })
  win.webContents.setBackgroundThrottling(false)
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) console.log(`  [渲染进程 ${level}] ${message} (${source}:${line})`)
  })

  console.log('=== 场景一：同一网站两个账号（标题相同，都是「淘宝网」）===')
  await inject(win, [
    { title: '淘宝网', username: 'alice@example.com' },
    { title: '淘宝网', username: 'bob@example.com' }
  ])
  const m1 = await measure(win)
  const user = m1.inputs.find((i) => i.id === 'username')
  const pwd = m1.inputs.find((i) => i.id === 'password')
  notes.push(`  用户名框 ${user.left}→${user.right}（宽 ${user.right - user.left}，高 ${user.height}）`)
  notes.push(`  密码框   ${pwd.left}→${pwd.right}（宽 ${pwd.right - pwd.left}，高 ${pwd.height}）`)

  check(m1.hosts.length === 2, '两个输入框都挂上了图标', `实际 ${m1.hosts.length} 个`)
  check(m1.hosts.every((h) => h.hasShadowButton), '图标按钮渲染在 shadow DOM 内')
  check(m1.hosts.every((h) => h.iconSize && h.iconSize[0] === ICON_SIZE && h.iconSize[1] === ICON_SIZE), '图标尺寸一致', JSON.stringify(m1.hosts.map((h) => h.iconSize)))
  check(m1.hosts.every((h) => h.display !== 'none'), '图标可见')

  const lefts = m1.hosts.map((h) => h.left)
  check(
    lefts.length === 2 && lefts[0] === lefts[1],
    '两个图标落在同一条竖直线上',
    `left = ${lefts.join(' / ')}`
  )
  const expectLeft = Math.round(Math.max(user.right, pwd.right) - ICON_SIZE - ICON_INSET)
  check(lefts.every((l) => l === expectLeft), '对齐到最宽输入框的右边缘', `期望 ${expectLeft}`)

  for (const h of m1.hosts) {
    const owner = [user, pwd].find((i) => Math.abs(i.cy - h.cy) <= Math.max(i.height, 20) / 2)
    check(
      !!owner && Math.abs(h.cy - owner.cy) <= 0.5,
      '图标在其输入框的垂直中线上',
      owner ? `${owner.id}: 图标中心 ${h.cy.toFixed(1)} / 输入框中心 ${owner.cy.toFixed(1)}` : '找不到归属输入框'
    )
  }

  await clickAnchor(win)
  const menu1 = await readMenu(win)
  check(menu1.open === true, '点击图标后菜单弹出')
  if (menu1.open) {
    notes.push(`  菜单标题：${menu1.head}`)
    check(menu1.items.length === 2, '菜单列出两个账号', `实际 ${menu1.items.length}`)
    check(
      menu1.items[0] && menu1.items[0].primary === 'alice@example.com',
      '主行显示的是用户名（而不是网站地址）',
      menu1.items[0] ? `主行 = 「${menu1.items[0].primary}」` : ''
    )
    check(
      menu1.items.every((i) => Number(i.weight) >= 600),
      '主行是加粗的',
      'font-weight = ' + menu1.items.map((i) => i.weight).join(' / ')
    )
    check(
      menu1.items.every((i) => i.sub === null),
      '标题相同的条目不再重复显示网站地址',
      '副行 = ' + JSON.stringify(menu1.items.map((i) => i.sub))
    )
  }

  console.log('=== 场景二：标题各不相同（用户自己起的名字，能区分子条目）===')
  await inject(win, [
    { title: '淘宝网 · 主号', username: 'alice@example.com' },
    { title: '淘宝网 · 小号', username: 'bob@example.com' }
  ])
  await clickAnchor(win)
  const menu2 = await readMenu(win)
  if (menu2.open) {
    check(
      menu2.items[0] && menu2.items[0].primary === 'alice@example.com' && menu2.items[0].sub === '淘宝网 · 主号',
      '主行是用户名、副行补充标题',
      menu2.items[0] ? `主行「${menu2.items[0].primary}」/ 副行「${menu2.items[0].sub}」` : ''
    )
  } else {
    check(false, '场景二菜单未能打开')
  }

  console.log('=== 场景三：条目没有用户名（老数据）===')
  await inject(win, [{ title: '某个网站', username: '' }])
  await clickAnchor(win)
  const menu3 = await readMenu(win)
  if (menu3.open) {
    check(
      menu3.items[0] && menu3.items[0].primary === '某个网站' && menu3.items[0].noUser === true,
      '没有用户名时退回显示标题（灰色）',
      menu3.items[0] ? `主行「${menu3.items[0].primary}」 empty=${menu3.items[0].noUser}` : ''
    )
  } else {
    check(false, '场景三菜单未能打开')
  }

  console.log('\n— 实测数据 —')
  notes.forEach((n) => console.log(n))
  console.log('\n================ 汇总 ================')
  if (failures.length === 0) {
    console.log('✅ 全部通过：图标对齐、主行显示账号、重复标题不再显示')
  } else {
    console.log(`✗ ${failures.length} 项未通过：`)
    failures.forEach((f) => console.log('  · ' + f))
  }
  win.destroy()
  app.exit(failures.length ? 1 : 0)
})
