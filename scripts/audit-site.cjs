/* 官网静态自检（纯 Node，不需要 Electron）：
   1. 检查页内锚点 (#xxx) 是否都有对应 id
   2. 检查本地资源引用（css/js/img/download）文件是否存在
   3. 检查图片 alt、按钮/链接文案是否有空
   4. 打印章节大纲，便于人工核对文案
   用法: node scripts/audit-site.cjs
*/
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'website')
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')

const problems = []
const info = []

/* ---------- 1. 锚点 ---------- */
const ids = new Set()
for (const m of html.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1])
const anchors = new Set()
for (const m of html.matchAll(/href="#([^"]*)"/g)) anchors.add(m[1])
for (const a of anchors) {
  if (a === '' ) continue
  if (!ids.has(a)) problems.push('锚点 #' + a + ' 没有对应的 id')
}

/* ---------- 2. 本地资源 ---------- */
const refs = []
for (const m of html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)) refs.push(m[1])
for (const r of refs) {
  if (/^(https?:|mailto:|data:)/.test(r)) continue
  const p = path.join(ROOT, r)
  if (!fs.existsSync(p)) {
    const isDownload = r.startsWith('download/')
    problems.push((isDownload ? '下载文件尚不存在（上线前需放入）: ' : '资源缺失: ') + r)
  }
}

/* ---------- 3. 空文案 / 图片 alt ---------- */
const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
imgs.forEach((tag, i) => {
  if (!/\salt="[^"]+"/.test(tag)) problems.push('第 ' + (i + 1) + ' 个 <img> 缺少 alt')
})
const emptyLink = [...html.matchAll(/<a\b[^>]*>\s*<\/a>/g)].length
if (emptyLink) problems.push('有 ' + emptyLink + ' 个空链接 <a></a>')

/* ---------- 4. SEO 文件 / 域名占位符 / 结构化数据 ---------- */
for (const f of ['sitemap.xml', 'robots.txt']) {
  if (!fs.existsSync(path.join(ROOT, f))) problems.push('缺少 SEO 文件: ' + f)
}
for (const f of ['index.html', 'sitemap.xml', 'robots.txt']) {
  const fp = path.join(ROOT, f)
  if (!fs.existsSync(fp)) continue
  const n = (fs.readFileSync(fp, 'utf8').match(/YOUR-DOMAIN\.com/g) || []).length
  if (n) problems.push(f + ' 里还有 ' + n + ' 处域名占位符 YOUR-DOMAIN.com（上线前必须替换）')
}

const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])
if (!ldBlocks.length) problems.push('没有找到 JSON-LD 结构化数据')
ldBlocks.forEach((raw, i) => {
  try {
    const obj = JSON.parse(raw)
    info.push('  JSON-LD #' + (i + 1) + ': @type=' + obj['@type'])
  } catch (e) {
    problems.push('第 ' + (i + 1) + ' 段 JSON-LD 不是合法 JSON: ' + e.message)
  }
})
for (const need of ['og:title', 'og:image', 'og:description', 'canonical', 'name="description"']) {
  if (!html.includes(need)) problems.push('缺少 SEO 必需项: ' + need)
}

/* ---------- 5. 大纲 ---------- */
for (const m of html.matchAll(/<(h1|h2|h3)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
  const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (text) info.push('  ' + '  '.repeat(['h1', 'h2', 'h3'].indexOf(m[1])) + m[1].toUpperCase() + ' ' + text)
}

const counts = {
  section: (html.match(/<section\b/g) || []).length,
  card: (html.match(/class="card[^"]*"/g) || []).length,
  faq: (html.match(/<details\b/g) || []).length,
  reveal: (html.match(/reveal/g) || []).length,
  img: imgs.length,
  link: (html.match(/<a\b/g) || []).length,
  bytes: Buffer.byteLength(html, 'utf8')
}

console.log('=== 章节大纲 ===')
console.log(info.join('\n'))
console.log('\n=== 计数 ===')
console.log('  ' + JSON.stringify(counts))
console.log('\n=== 结论 ===')
if (problems.length) {
  console.log('  ✗ ' + problems.length + ' 个问题：')
  problems.forEach((p) => console.log('    · ' + p))
  process.exit(1)
} else {
  console.log('  ✅ 锚点、资源引用、文案检查全部通过')
}
