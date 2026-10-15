;(function () {
  if (window.__safevaultInjected) return
  window.__safevaultInjected = true

  const ICON_SIZE = 22
  const MENU_WIDTH = 268
  const MENU_MAX_HEIGHT = 300

  const anchors = new Map() // input -> { host, input }
  let menuHost = null
  let filledKey = null
  let matchCache = null // null=未查询, []=无匹配, [...] =有匹配
  let repositionScheduled = false
  let syncTimer = null

  // ---------------- 基础工具 ----------------

  function isVisible(el) {
    if (!el || !el.isConnected) return false
    const rect = el.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8) return false
    const style = getComputedStyle(el)
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
  }

  function passwordFields() {
    return Array.from(document.querySelectorAll('input[type="password"]')).filter(isVisible)
  }

  function scoreUsername(el, pwd) {
    let score = 0
    const hint = (
      (el.name || '') +
      ' ' +
      (el.id || '') +
      ' ' +
      (el.getAttribute('autocomplete') || '') +
      ' ' +
      (el.placeholder || '')
    ).toLowerCase()
    if (/user|account|email|login|phone|mobile|账号|用户名|邮箱|手机|登录/.test(hint)) score += 6
    if (el.type === 'email') score += 4
    if (el.type === 'tel') score += 3
    if (el.type === 'text' || el.type === '') score += 1
    if (pwd && el.compareDocumentPosition(pwd) & Node.DOCUMENT_POSITION_FOLLOWING) score += 3
    if (!isVisible(el)) score -= 100
    return score
  }

  function findUsernameInput(pwd) {
    const scope = pwd.form || document
    const inputs = Array.from(scope.querySelectorAll('input')).filter(
      (el) => ['text', 'email', 'tel', ''].indexOf(el.type) >= 0
    )
    let best = null
    let bestScore = 0
    for (const el of inputs) {
      const s = scoreUsername(el, pwd)
      if (s > bestScore) {
        bestScore = s
        best = el
      }
    }
    return bestScore > 0 ? best : null
  }

  function setValue(el, value) {
    if (!el || value == null) return
    const proto =
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'value')
    try {
      if (desc && desc.set) desc.set.call(el, value)
      else el.value = value
    } catch (e) {
      el.value = value
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Process' }))
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Process' }))
  }

  function fillCredential(cred) {
    if (!cred) return false
    const pwds = passwordFields()
    if (pwds.length === 0) return false
    const pwd = pwds[0]
    const user = findUsernameInput(pwd)
    if (user && cred.username) setValue(user, cred.username)
    setValue(pwd, cred.password)
    try {
      pwd.focus({ preventScroll: true })
    } catch (e) {
      pwd.focus()
    }
    return true
  }

  function send(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) resolve(null)
          else resolve(res)
        })
      } catch (e) {
        resolve(null)
      }
    })
  }

  // ---------------- 内联图标 ----------------

  const KEY_SVG =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10.6 13.4 19 5"/><path d="M16.6 7.4 19 9.8"/></svg>'

  const ANCHOR_CSS = `
    .sv-btn {
      pointer-events: auto;
      display: flex; align-items: center; justify-content: center;
      width: ${ICON_SIZE}px; height: ${ICON_SIZE}px; padding: 0;
      border: none; border-radius: 6px; cursor: pointer;
      background: #2563eb; color: #fff;
      opacity: .55; transition: opacity .15s ease, transform .15s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,.28);
    }
    .sv-btn:hover { opacity: 1; transform: scale(1.1); }
    .sv-btn:active { transform: scale(.96); }
  `

  function createAnchor(input) {
    const host = document.createElement('div')
    host.setAttribute('data-safevault', 'anchor')
    host.style.cssText =
      'position:fixed;z-index:2147483646;pointer-events:none;margin:0;padding:0;border:0;'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = ANCHOR_CSS
    const btn = document.createElement('button')
    btn.className = 'sv-btn'
    btn.type = 'button'
    btn.title = '钥匙窝 填充'
    btn.innerHTML = KEY_SVG
    // 内联样式兜底：少数站点严格 CSP 会拦截 <style>，此时图标仍应可见
    btn.style.cssText =
      'display:flex;align-items:center;justify-content:center;' +
      'width:' +
      ICON_SIZE +
      'px;height:' +
      ICON_SIZE +
      'px;padding:0;border:none;border-radius:6px;cursor:pointer;' +
      'background:#2563eb;color:#fff;opacity:.6;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.28);'
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
    })
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      void openMenu(host)
    })
    shadow.appendChild(style)
    shadow.appendChild(btn)
    document.documentElement.appendChild(host)
    return { host, input }
  }

  function positionAnchor(entry) {
    const rect = entry.input.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8 || rect.bottom < 0 || rect.top > window.innerHeight) {
      entry.host.style.display = 'none'
      return
    }
    entry.host.style.display = 'block'
    entry.host.style.left = Math.round(rect.right - ICON_SIZE - 5) + 'px'
    entry.host.style.top = Math.round(rect.top + (rect.height - ICON_SIZE) / 2) + 'px'
    entry.host.style.width = ICON_SIZE + 'px'
    entry.host.style.height = ICON_SIZE + 'px'
  }

  function clearAnchors() {
    for (const entry of anchors.values()) entry.host.remove()
    anchors.clear()
  }

  function syncAnchors() {
    for (const [input, entry] of anchors) {
      if (!input.isConnected || !isVisible(input)) {
        entry.host.remove()
        anchors.delete(input)
      }
    }

    // 只有在确认存在匹配条目时才显示图标，避免在无关表单上打扰
    if (!matchCache || matchCache.length === 0) {
      if (anchors.size > 0) clearAnchors()
      return
    }

    const targets = new Set()
    for (const pwd of passwordFields()) {
      targets.add(pwd)
      const user = findUsernameInput(pwd)
      if (user) targets.add(user)
    }
    for (const input of targets) {
      if (!anchors.has(input)) anchors.set(input, createAnchor(input))
    }
    for (const entry of anchors.values()) positionAnchor(entry)
  }

  function repositionAll() {
    for (const entry of anchors.values()) positionAnchor(entry)
  }

  function scheduleReposition() {
    if (repositionScheduled) return
    repositionScheduled = true
    requestAnimationFrame(() => {
      repositionScheduled = false
      repositionAll()
    })
  }

  function scheduleSync() {
    if (syncTimer) return
    syncTimer = setTimeout(() => {
      syncTimer = null
      syncAnchors()
    }, 300)
  }

  function onReposition() {
    scheduleReposition()
  }

  // ---------------- 下拉菜单 ----------------

  const MENU_CSS = `
    .wrap {
      width: ${MENU_WIDTH}px; max-height: ${MENU_MAX_HEIGHT}px; overflow-y: auto;
      background: #fff; color: #0f172a; border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.22); border: 1px solid rgba(148,163,184,.35);
      font-family: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
      font-size: 13px; padding: 4px;
    }
    .head {
      padding: 6px 8px; font-size: 11px; color: #64748b;
      border-bottom: 1px solid rgba(148,163,184,.25); margin-bottom: 4px;
    }
    .item {
      display: flex; align-items: center; gap: 8px; width: 100%;
      padding: 7px 8px; border: none; background: transparent; cursor: pointer;
      border-radius: 7px; text-align: left; font: inherit; color: inherit;
    }
    .item:hover { background: rgba(37,99,235,.1); }
    .info { flex: 1; min-width: 0; }
    .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .user { font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hint { padding: 10px 8px; font-size: 12px; color: #64748b; line-height: 1.7; }
    @media (prefers-color-scheme: dark) {
      .wrap { background: #1e293b; color: #e2e8f0; border-color: rgba(148,163,184,.25); }
      .user, .hint, .head { color: #94a3b8; }
      .item:hover { background: rgba(59,130,246,.2); }
    }
  `

  function closeMenu() {
    if (menuHost) {
      menuHost.remove()
      menuHost = null
    }
    document.removeEventListener('mousedown', onDocMouseDown, true)
    document.removeEventListener('keydown', onDocKeyDown, true)
    window.removeEventListener('resize', closeMenu, true)
  }

  function onDocMouseDown(e) {
    if (menuHost && !e.composedPath().includes(menuHost)) closeMenu()
  }

  function onDocKeyDown(e) {
    if (e.key === 'Escape') closeMenu()
  }

  async function openMenu(anchorHost) {
    closeMenu()
    const host = document.createElement('div')
    host.setAttribute('data-safevault', 'menu')
    host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:auto;'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = MENU_CSS
    const wrap = document.createElement('div')
    wrap.className = 'wrap'
    wrap.innerHTML = '<div class="head">钥匙窝</div><div class="hint">正在读取…</div>'
    shadow.appendChild(style)
    shadow.appendChild(wrap)
    document.documentElement.appendChild(host)
    menuHost = host

    const r = anchorHost.getBoundingClientRect()
    let left = r.right - MENU_WIDTH
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8))
    let top = r.bottom + 6
    if (top + MENU_MAX_HEIGHT > window.innerHeight - 8) {
      top = Math.max(8, r.top - MENU_MAX_HEIGHT - 6)
    }
    host.style.left = Math.round(left) + 'px'
    host.style.top = Math.round(top) + 'px'

    document.addEventListener('mousedown', onDocMouseDown, true)
    document.addEventListener('keydown', onDocKeyDown, true)
    window.addEventListener('resize', closeMenu, true)

    const res = await send({ type: 'query', domain: location.hostname })
    if (menuHost !== host) return

    if (!res) {
      wrap.innerHTML =
        '<div class="head">钥匙窝</div><div class="hint">无法与扩展通信，请在扩展管理页重新加载扩展。</div>'
      return
    }
    if (!res.ok) {
      const msg =
        res.error === 'NO_TOKEN'
          ? '尚未配对：请点击浏览器工具栏的 钥匙窝 图标，粘贴访问令牌。'
          : res.error === 'UNAUTHORIZED'
            ? '访问令牌无效：请在扩展弹窗中重新粘贴令牌。'
            : '无法连接 钥匙窝：请确认应用已启动、密码库已解锁、扩展服务已启用。'
      wrap.innerHTML = '<div class="head">钥匙窝</div><div class="hint">' + msg + '</div>'
      return
    }

    const matches = (res.data && res.data.matches) || []
    matchCache = matches
    if (matches.length === 0) {
      wrap.innerHTML =
        '<div class="head">钥匙窝</div><div class="hint">没有与 <b>' +
        escapeHtml(location.hostname) +
        '</b> 匹配的条目。<br>请检查该条目的「网址」字段。</div>'
      return
    }

    const head = document.createElement('div')
    head.className = 'head'
    head.textContent = '钥匙窝 · ' + matches.length + ' 个匹配条目'
    wrap.innerHTML = ''
    wrap.appendChild(head)

    matches.forEach((m) => {
      const btn = document.createElement('button')
      btn.className = 'item'
      btn.type = 'button'
      const info = document.createElement('div')
      info.className = 'info'
      const t = document.createElement('div')
      t.className = 'title'
      t.textContent = m.title || '(无标题)'
      const u = document.createElement('div')
      u.className = 'user'
      u.textContent = m.username || ''
      info.appendChild(t)
      info.appendChild(u)
      btn.appendChild(info)
      btn.addEventListener('click', () => {
        fillCredential(m)
        closeMenu()
      })
      wrap.appendChild(btn)
    })
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  // ---------------- 匹配查询与自动填充 ----------------

  async function refreshMatches() {
    const res = await send({ type: 'query', domain: location.hostname })
    matchCache = res && res.ok && res.data && res.data.matches ? res.data.matches : []
    syncAnchors()
  }

  async function tryAutoFill() {
    const key = location.hostname + location.pathname
    if (filledKey === key) return
    if (passwordFields().length === 0) return

    const settings = await send({ type: 'getSettings' })
    if (!settings || settings.autoFill === false) return

    if (matchCache === null) await refreshMatches()
    if (!matchCache || matchCache.length === 0) return

    if (fillCredential(matchCache[0])) filledKey = key
  }

  // ---------------- 消息（供弹窗调用） ----------------

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'getDomain') {
      sendResponse({ domain: location.hostname })
      return true
    }
    if (msg && msg.type === 'fill') {
      sendResponse({ ok: fillCredential(msg.credential) })
      return true
    }
    return false
  })

  // ---------------- 捕获登录信息并提示保存 ----------------

  const SAVE_CSS = `
    .bar {
      width: 300px; background: #fff; color: #0f172a; border-radius: 12px;
      box-shadow: 0 10px 30px rgba(0,0,0,.25); border: 1px solid rgba(148,163,184,.35);
      font-family: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
      font-size: 13px; padding: 12px;
    }
    .row { display: flex; gap: 10px; align-items: flex-start; }
    .icon { font-size: 18px; line-height: 1.1; }
    .info { flex: 1; min-width: 0; }
    .t { font-weight: 600; }
    .s { font-size: 11px; color: #64748b; margin-top: 3px; word-break: break-all; }
    .actions { display: flex; gap: 8px; margin-top: 10px; justify-content: flex-end; }
    button {
      border: none; border-radius: 7px; padding: 6px 12px; font-size: 12px;
      cursor: pointer; font-family: inherit;
    }
    .save { background: #2563eb; color: #fff; }
    .save:hover { background: #1d4fd8; }
    .save:disabled { opacity: .6; cursor: default; }
    .later { background: rgba(148,163,184,.2); color: inherit; }
    @media (prefers-color-scheme: dark) {
      .bar { background: #1e293b; color: #e2e8f0; border-color: rgba(148,163,184,.25); }
      .s { color: #94a3b8; }
      .later { background: rgba(148,163,184,.25); color: #e2e8f0; }
    }
  `

  function looksLikeSubmit(el) {
    if (!el) return false
    if (el.tagName === 'INPUT' && (el.type === 'submit' || el.type === 'button')) return true
    const text = (
      (el.textContent || '') +
      ' ' +
      (el.getAttribute('aria-label') || '') +
      ' ' +
      (el.getAttribute('title') || '')
    ).trim()
    if (!text) return false
    return /登录|登陆|注册|提交|确定|确认|下一步|sign\s*-?\s*in|log\s*-?\s*in|login|sign\s*-?\s*up|signup|register|submit|continue|next/i.test(
      text
    )
  }

  function captureCredentials() {
    const pwds = passwordFields()
    if (pwds.length === 0) return null
    const pwd = pwds[0]
    if (!pwd.value) return null
    const user = findUsernameInput(pwd)
    return {
      url: location.href,
      username: user ? user.value : '',
      password: pwd.value,
      title: (document.title || '').slice(0, 80)
    }
  }

  let lastCapturedKey = ''

  function onCredentialMaybeSubmitted() {
    const cred = captureCredentials()
    if (!cred) return
    const key = cred.username + '\u0000' + cred.password
    if (key === lastCapturedKey) return
    lastCapturedKey = key
    void send({ type: 'rememberPending', data: cred })
    // 若页面不跳转（SPA），稍后在本页提示
    setTimeout(() => void checkPending(), 1600)
  }

  async function checkPending() {
    if (document.hidden) return
    const res = await send({ type: 'takePending', domain: location.hostname })
    if (!res || !res.data) return
    const verdict = await send({ type: 'shouldOfferSave', data: res.data })
    if (!verdict || !verdict.offer) return
    showSavePrompt(res.data)
  }

  function showSavePrompt(cred) {
    const old = document.querySelector('[data-safevault="savebar"]')
    if (old) old.remove()

    const host = document.createElement('div')
    host.setAttribute('data-safevault', 'savebar')
    host.style.cssText =
      'position:fixed;z-index:2147483647;top:16px;right:16px;pointer-events:auto;'
    const shadow = host.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = SAVE_CSS
    const bar = document.createElement('div')
    bar.className = 'bar'
    const row = document.createElement('div')
    row.className = 'row'
    const icon = document.createElement('div')
    icon.className = 'icon'
    icon.textContent = '\uD83D\uDD11'
    const info = document.createElement('div')
    info.className = 'info'
    const title = document.createElement('div')
    title.className = 't'
    title.textContent = '保存登录信息到 钥匙窝？'
    const sub = document.createElement('div')
    sub.className = 's'
    sub.textContent = (cred.username || '(无用户名)') + ' · ' + location.hostname
    info.appendChild(title)
    info.appendChild(sub)
    row.appendChild(icon)
    row.appendChild(info)

    const actions = document.createElement('div')
    actions.className = 'actions'
    const laterBtn = document.createElement('button')
    laterBtn.className = 'later'
    laterBtn.textContent = '忽略'
    const saveBtn = document.createElement('button')
    saveBtn.className = 'save'
    saveBtn.textContent = '保存'
    actions.appendChild(laterBtn)
    actions.appendChild(saveBtn)

    bar.appendChild(row)
    bar.appendChild(actions)
    shadow.appendChild(style)
    shadow.appendChild(bar)
    document.documentElement.appendChild(host)

    const close = () => host.remove()
    laterBtn.addEventListener('click', close)
    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true
      saveBtn.textContent = '保存中…'
      void send({ type: 'save', data: cred }).then((res) => {
        if (res && res.ok) {
          title.textContent =
            res.data && res.data.action === 'updated' ? '已更新密码' : '已保存到 钥匙窝'
          sub.textContent = (res.data && res.data.title) || ''
          setTimeout(close, 1500)
          return
        }
        const err = res && res.error
        title.textContent =
          err === 'LOCKED'
            ? '钥匙窝 已锁定，请先解锁'
            : err === 'OFFLINE'
              ? '无法连接 钥匙窝'
              : err === 'UNAUTHORIZED'
                ? '访问令牌无效'
                : err === 'NO_TOKEN'
                  ? '尚未与 钥匙窝 配对'
                  : '保存失败，请重试'
        saveBtn.disabled = false
        saveBtn.textContent = '重试'
      })
    })

    setTimeout(() => {
      if (host.isConnected) close()
    }, 25000)
  }

  // ---------------- 生命周期 ----------------

  window.addEventListener('scroll', onReposition, { passive: true, capture: true })
  window.addEventListener('resize', onReposition, { passive: true })

  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target
      if (form && form.querySelector && form.querySelector('input[type="password"]')) {
        onCredentialMaybeSubmitted()
      }
    },
    true
  )

  document.addEventListener(
    'click',
    (e) => {
      const el = e.target
      if (!el || !el.closest) return
      const btn = el.closest('button, input[type="submit"], [role="button"], a')
      if (!btn || !looksLikeSubmit(btn)) return
      setTimeout(onCredentialMaybeSubmitted, 350)
    },
    true
  )
  window.addEventListener('pageshow', () => {
    matchCache = null
    void refreshMatches()
    void tryAutoFill()
  })

  const observer = new MutationObserver(() => {
    scheduleSync()
  })

  function start() {
    void refreshMatches().then(() => void tryAutoFill())
    if (document.documentElement) {
      observer.observe(document.documentElement, { childList: true, subtree: true })
    }
    ;[1200, 3000, 6000].forEach((t) =>
      setTimeout(() => {
        scheduleSync()
        void tryAutoFill()
      }, t)
    )
    // 页面跳转后：检查是否有待保存的登录信息
    setTimeout(() => void checkPending(), 1500)
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
