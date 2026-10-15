const $ = (id) => document.getElementById(id)

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
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

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    return tabs && tabs[0] ? tabs[0] : null
  } catch (e) {
    return null
  }
}

async function getDomain() {
  const tab = await getActiveTab()
  if (!tab || !tab.id) return ''
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'getDomain' })
    return res && res.domain ? res.domain : ''
  } catch (e) {
    return ''
  }
}

function render(html) {
  $('content').innerHTML = html
}

function showSetup(show) {
  $('setup').hidden = !show
}

async function init() {
  const settings = await send({ type: 'getSettings' })
  if (!settings) {
    $('status').textContent = '扩展异常'
    render('<p class="hint">无法与扩展后台通信，请尝试重新加载扩展。</p>')
    return
  }

  $('token').value = settings.token || ''
  $('port').value = settings.port || 38471
  $('autoFill').checked = settings.autoFill !== false
  $('offerSave').checked = settings.offerSave !== false

  if (!settings.token) {
    $('status').textContent = '未配对'
    showSetup(true)
    render(
      '<p class="hint">首次使用：在 钥匙窝 中打开「设置 → 浏览器扩展（自动填充）」，复制访问令牌，粘贴到下方输入框并保存。</p>'
    )
    return
  }

  const status = await send({ type: 'status' })
  if (!status || !status.ok) {
    const err = status && status.error
    $('status').textContent = err === 'UNAUTHORIZED' ? '令牌无效' : '未连接'
    showSetup(true)
    render(
      '<p class="hint">' +
        (err === 'UNAUTHORIZED'
          ? '访问令牌不正确，请在下方重新粘贴 钥匙窝 中的令牌。'
          : '无法连接 钥匙窝。请确认 钥匙窝 正在运行，且「浏览器扩展」服务已启用。') +
        '</p>'
    )
    return
  }

  if (!status.data || !status.data.unlocked) {
    $('status').textContent = '已锁定'
    render('<p class="hint">钥匙窝 当前处于锁定状态，请先在应用中解锁密码库。</p>')
    return
  }

  $('status').textContent = '已连接'

  const domain = await getDomain()
  if (!domain) {
    render('<p class="hint">当前页面不支持自动填充（浏览器内部页面或权限不足）。</p>')
    return
  }

  const res = await send({ type: 'query', domain })
  const matches = res && res.ok && res.data && res.data.matches ? res.data.matches : []
  if (matches.length === 0) {
    render(
      '<p class="hint">在 钥匙窝 中没有找到与 <b>' +
        escapeHtml(domain) +
        '</b> 匹配的条目。<br />请检查该条目的「网址」字段是否包含此域名。</p>'
    )
    return
  }

  render(
    matches
      .map((m, i) => {
        return (
          '<div class="item"><div class="info"><div class="title">' +
          escapeHtml(m.title || '(无标题)') +
          '</div><div class="user">' +
          escapeHtml(m.username || '') +
          '</div></div><button data-i="' +
          i +
          '">填充</button></div>'
        )
      })
      .join('')
  )

  document.querySelectorAll('button[data-i]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cred = matches[Number(btn.dataset.i)]
      const tab = await getActiveTab()
      if (tab && tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'fill', credential: cred })
        } catch (e) {
          /* 忽略 */
        }
      }
      window.close()
    })
  })
}

$('save').addEventListener('click', async () => {
  const token = $('token').value.trim()
  const port = Number($('port').value) || 38471
  const autoFill = $('autoFill').checked
  const offerSave = $('offerSave').checked
  await send({ type: 'saveSettings', settings: { token, port, autoFill, offerSave } })
  $('save').textContent = '已保存'
  setTimeout(() => window.location.reload(), 400)
})

init()
