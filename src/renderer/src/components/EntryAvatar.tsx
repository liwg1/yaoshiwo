import { useEffect, useState } from 'react'
import { extractDomain, entryColor, fetchFavicon } from '../lib/favicon'
import { matchSite } from '../lib/site-match'

/**
 * 条目头像：
 * 1. 有网址则优先显示网站 favicon；
 * 2. favicon 抓不到，或没有网址时，用中文名称模糊匹配常用网站（相似度 > 80%），
 *    命中后按匹配到的规范域名再取一次 Logo；
 * 3. 都不行则显示彩色首字母。
 */
export default function EntryAvatar({
  url,
  title,
  size = 32
}: {
  url: string
  title: string
  size?: number
}): JSX.Element {
  const urlDomain = extractDomain(url)
  const matchedDomain = matchSite(title)?.domain ?? null
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)

    const candidates: string[] = []
    if (urlDomain) candidates.push(urlDomain)
    if (matchedDomain && matchedDomain !== urlDomain) candidates.push(matchedDomain)

    void (async () => {
      for (const d of candidates) {
        const data = await fetchFavicon(d)
        if (cancelled) return
        if (data) {
          setSrc(data)
          return
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [urlDomain, matchedDomain])

  const color = entryColor(urlDomain ?? title)
  const initial = (title.trim().charAt(0) || '?').toUpperCase()

  if (src) {
    return (
      <div
        className="shrink-0 rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="object-contain"
          style={{ width: size * 0.74, height: size * 0.74 }}
          onError={() => setSrc(null)}
        />
      </div>
    )
  }

  return (
    <div
      className="shrink-0 rounded-lg flex items-center justify-center font-semibold select-none"
      style={{ width: size, height: size, backgroundColor: color + '22', color, fontSize: Math.round(size * 0.42) }}
    >
      {initial}
    </div>
  )
}
