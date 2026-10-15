import { createServer, IncomingMessage, ServerResponse, Server } from 'http'
import { randomBytes } from 'crypto'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'

export interface CredentialItem {
  uuid: string
  title: string
  username: string
  password: string
  url: string
}

export interface SaveRequest {
  url: string
  username: string
  password: string
  title?: string
}

export interface SaveResult {
  ok: boolean
  action?: 'created' | 'updated'
  title?: string
  error?: string
}

let saveHandler: ((data: SaveRequest) => Promise<SaveResult>) | null = null

export function setSaveHandler(fn: (data: SaveRequest) => Promise<SaveResult>): void {
  saveHandler = fn
}

const PORT = 38471

let snapshot: CredentialItem[] = []
let token = ''
let enabled = true
let server: Server | null = null

function configPath(): string {
  return join(app.getPath('userData'), 'extension.json')
}

function loadConfig(): { token: string; enabled: boolean } {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'))
    return { token: String(parsed.token || ''), enabled: parsed.enabled !== false }
  } catch {
    return { token: '', enabled: true }
  }
}

function saveConfig(): void {
  try {
    const dir = app.getPath('userData')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(configPath(), JSON.stringify({ token, enabled }), 'utf8')
  } catch {
    // 忽略
  }
}

function domainOf(u: string): string {
  const s = (u || '').trim()
  if (!s) return ''
  try {
    const parsed = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? new URL(s) : new URL('https://' + s)
    return parsed.hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** 页面域名与条目网址是否匹配（支持子域双向匹配） */
function matchDomain(entryUrl: string, pageDomain: string): boolean {
  const d = domainOf(entryUrl)
  const p = (pageDomain || '').toLowerCase().replace(/^www\./, '')
  if (!d || !p) return false
  return d === p || p.endsWith('.' + d) || d.endsWith('.' + p)
}

function sendJson(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => {
      data += chunk
      if (data.length > 2_000_000) req.destroy()
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-safevault-token')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const reqToken = String(req.headers['x-safevault-token'] || '')
  if (!token || reqToken !== token) {
    sendJson(res, 401, { error: 'unauthorized' })
    return
  }

  let pathname = '/'
  try {
    pathname = new URL(req.url || '/', `http://127.0.0.1:${PORT}`).pathname
  } catch {
    sendJson(res, 400, { error: 'bad_request' })
    return
  }

  if (pathname === '/ping' || pathname === '/status') {
    sendJson(res, 200, {
      app: '钥匙窝',
      version: 1,
      unlocked: snapshot.length > 0,
      count: snapshot.length
    })
    return
  }

  if (pathname === '/query') {
    void readBody(req).then((body) => {
      const domain = String(body.domain || '')
      const matches = snapshot
        .filter((c) => matchDomain(c.url, domain))
        .map((c) => ({
          uuid: c.uuid,
          title: c.title,
          username: c.username,
          password: c.password,
          url: c.url
        }))
      sendJson(res, 200, { matches })
    })
    return
  }

  if (pathname === '/save' && req.method === 'POST') {
    void readBody(req).then(async (body) => {
      if (snapshot.length === 0) {
        sendJson(res, 409, { ok: false, error: 'locked' })
        return
      }
      if (!saveHandler) {
        sendJson(res, 503, { ok: false, error: 'unavailable' })
        return
      }
      const data: SaveRequest = {
        url: String(body.url || ''),
        username: String(body.username || ''),
        password: String(body.password || ''),
        title: String(body.title || '')
      }
      if (!data.url || !data.password) {
        sendJson(res, 400, { ok: false, error: 'invalid' })
        return
      }
      try {
        const result = await saveHandler(data)
        sendJson(res, result.ok ? 200 : 500, result)
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err) })
      }
    })
    return
  }

  sendJson(res, 404, { error: 'not_found' })
}

function startServer(): void {
  if (server) return
  server = createServer(handleRequest)
  server.on('error', () => {
    // 端口被占用等情况静默处理
  })
  server.listen(PORT, '127.0.0.1')
}

function stopServer(): void {
  if (server) {
    server.close()
    server = null
  }
}

export function initExtensionServer(): void {
  const cfg = loadConfig()
  token = cfg.token || randomBytes(24).toString('hex')
  enabled = cfg.enabled
  saveConfig()
  if (enabled) startServer()
}

export function setExtensionEnabled(value: boolean): void {
  enabled = value
  saveConfig()
  if (value) startServer()
  else stopServer()
}

export function regenerateToken(): string {
  token = randomBytes(24).toString('hex')
  saveConfig()
  return token
}

export function getExtensionConfig(): {
  port: number
  token: string
  enabled: boolean
  running: boolean
} {
  return { port: PORT, token, enabled, running: server !== null }
}

export function syncCredentials(list: CredentialItem[]): void {
  snapshot = Array.isArray(list) ? list : []
}

export function clearCredentials(): void {
  snapshot = []
}
