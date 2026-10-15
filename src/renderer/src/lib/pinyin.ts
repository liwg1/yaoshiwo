import { pinyin } from 'pinyin-pro'

const cache = new Map<string, string>()
const MAX_CACHE = 6000

/**
 * 生成用于模糊搜索的拼音文本：全拼 + 首字母（均去空格、转小写）。
 * 非中文字符原样保留，因此中英混排（如 "Edge浏览器"）也能匹配。
 */
export function pinyinSearchText(text: string): string {
  if (!text) return ''
  const cached = cache.get(text)
  if (cached !== undefined) return cached
  let result = ''
  try {
    const full = pinyin(text, { toneType: 'none', type: 'array' }).join('')
    const initials = pinyin(text, { pattern: 'first', toneType: 'none', type: 'array' }).join('')
    result = (full + initials).toLowerCase().replace(/\s+/g, '')
  } catch {
    result = ''
  }
  if (cache.size > MAX_CACHE) cache.clear()
  cache.set(text, result)
  return result
}

/** 归一化搜索关键词：小写 + 去除所有空格（便于 "guo jia" 匹配 "guojia"） */
export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, '')
}
