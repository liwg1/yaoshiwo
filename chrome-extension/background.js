const DEFAULT_PORT = 38471
const PENDING_KEY = 'pendingSave'
const PENDING_TTL = 3 * 60 * 1000

async function getSettings() {
  const s = await chrome.storage.local.get(['port', 'token', 'autoFill', 'offerSave'])
  return {
    port: Number(s.port) || DEFAULT_PORT,
    token: String(s.token || ''),
    autoFill: s.autoFill !== false,
    offerSave: s.offerSave !== false
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch (e) {
    return ''
  }
}

async function callApi(path, init) {
  const { port, token } = await getSettings()
  if (!token) return { ok: false, error: 'NO_TOKEN' }
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...(init || {}),
      headers: {
        'Content-Type': 'application/json',
        'X-SafeVault-Token': token,
        ...((init && init.headers) || {})
      }
    })
    if (res.status === 401) return { ok: false, error: 'UNAUTHORIZED' }
    const body = await res.json().catch(() => ({}))
    if (res.status === 409) return { ok: false, error: 'LOCKED', data: body }
    if (!res.ok) return { ok: false, error: 'HTTP_' + res.status, data: body }
    return { ok: true, data: body }
  } catch (e) {
    return { ok: false, error: 'OFFLINE' }
  }
}

/** 是否需要提示保存：已存在完全相同的账号密码则不提示 */
async function shouldOfferSave(data) {
  const settings = await getSettings()
  if (!settings.offerSave) return { offer: false }
  if (!data || !data.password) return { offer: false }
  const res = await callApi('/query', {
    method: 'POST',
    body: JSON.stringify({ domain: domainOf(data.url) })
  })
  if (!res.ok) return { offer: false }
  const matches = (res.data && res.data.matches) || []
  const already = matches.some(
    (m) => m.username === data.username && m.password === data.password
  )
  return { offer: !already }
}

async function rememberPending(data) {
  try {
    await chrome.storage.session.set({ [PENDING_KEY]: { ...data, ts: Date.now() } })
  } catch (e) {
    /* 忽略 */
  }
}

async function takePending(domain) {
  try {
    const obj = await chrome.storage.session.get(PENDING_KEY)
    const pending = obj[PENDING_KEY]
    if (!pending) return { data: null }
    await chrome.storage.session.remove(PENDING_KEY)
    if (Date.now() - pending.ts > PENDING_TTL) return { data: null }
    if (domain && domainOf(pending.url) !== domain) return { data: null }
    return { data: pending }
  } catch (e) {
    return { data: null }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false

  if (msg.type === 'query') {
    callApi('/query', { method: 'POST', body: JSON.stringify({ domain: msg.domain }) }).then(
      sendResponse
    )
    return true
  }

  if (msg.type === 'status') {
    callApi('/status').then(sendResponse)
    return true
  }

  if (msg.type === 'getSettings') {
    getSettings().then(sendResponse)
    return true
  }

  if (msg.type === 'saveSettings') {
    chrome.storage.local
      .set(msg.settings || {})
      .then(() => getSettings())
      .then(sendResponse)
    return true
  }

  if (msg.type === 'shouldOfferSave') {
    shouldOfferSave(msg.data).then(sendResponse)
    return true
  }

  if (msg.type === 'rememberPending') {
    rememberPending(msg.data).then(() => sendResponse({ ok: true }))
    return true
  }

  if (msg.type === 'takePending') {
    takePending(msg.domain).then(sendResponse)
    return true
  }

  if (msg.type === 'save') {
    callApi('/save', { method: 'POST', body: JSON.stringify(msg.data) }).then(sendResponse)
    return true
  }

  return false
})
