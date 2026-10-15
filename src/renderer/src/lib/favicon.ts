/** 从条目 URL 提取域名（小写 hostname） */
export function extractDomain(url: string): string | null {
  const s = url.trim()
  if (!s) return null
  try {
    const u = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s) ? new URL(s) : new URL('https://' + s)
    return u.hostname.toLowerCase() || null
  } catch {
    return null
  }
}

const PALETTE = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#d946ef',
  '#ec4899'
]

/** 根据种子字符串确定性生成一个颜色 */
export function entryColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const cache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()
const queue: { domain: string; resolve: (v: string | null) => void }[] = []
let active = 0
const MAX_CONCURRENT = 6

/** 获取域名 favicon（data URI），失败返回 null；带内存缓存与并发控制 */
export function fetchFavicon(domain: string): Promise<string | null> {
  const cached = cache.get(domain)
  if (cached !== undefined) return Promise.resolve(cached)
  const existing = inFlight.get(domain)
  if (existing) return existing

  let resolveFn: (v: string | null) => void = () => {}
  const promise = new Promise<string | null>((resolve) => {
    resolveFn = resolve
  })
  inFlight.set(domain, promise)
  queue.push({ domain, resolve: resolveFn })
  pump()
  return promise
}

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()
    if (!item) break
    active++
    loadFavicon(item.domain)
      .then((data) => {
        cache.set(item.domain, data)
        item.resolve(data)
      })
      .catch(() => {
        cache.set(item.domain, null)
        item.resolve(null)
      })
      .finally(() => {
        active--
        inFlight.delete(item.domain)
        pump()
      })
  }
}

async function loadFavicon(domain: string): Promise<string | null> {
  try {
    const res = await window.api.fetchFavicon(domain)
    return res?.data ?? null
  } catch {
    return null
  }
}
