/**
 * 品牌名可占用性检查（纯 Node，走系统 HTTPS，不依赖 curl/Schannel）
 *   - .com 域名：Verisign RDAP，404 = 未被注册（可注册）
 *   - GitHub : api.github.com/users/<name>，404 = 用户名可用
 * 用法： node scripts/check-names.cjs yaoxia yaogui ...
 */
const https = require('https')

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 12000, headers: { 'user-agent': 'safevault-namecheck' } }, (res) => {
      res.resume()
      res.on('end', () => resolve({ code: res.statusCode, headers: res.headers }))
    })
    req.on('timeout', () => { req.destroy(); resolve({ code: 0, err: 'timeout' }) })
    req.on('error', (e) => resolve({ code: 0, err: e.code || e.message }))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function domainFree(name, tld) {
  const host = 'rdap.verisign.com'
  let r = await get(`https://${host}/${tld}/v1/domain/${name}.${tld}`)
  if (r.code === 0) { await sleep(1500); r = await get(`https://${host}/${tld}/v1/domain/${name}.${tld}`) }
  if (r.code === 404) return { free: true }
  if (r.code === 200) return { free: false, detail: '已注册' }
  return { free: null, detail: (r.err || 'HTTP ' + r.code) }
}

async function githubFree(name) {
  const r = await get(`https://api.github.com/users/${encodeURIComponent(name)}`)
  if (r.code === 404) return { free: true }
  if (r.code === 200) return { free: false, detail: '已被占用' }
  if (r.code === 403) return { free: null, detail: 'GitHub 限流，稍后再试' }
  return { free: null, detail: (r.err || 'HTTP ' + r.code) }
}

const mark = (r) => (r.free === true ? '可用 ✅' : r.free === false ? '已占用 ❌ ' + (r.detail || '') : '未知 ⚠ ' + (r.detail || ''))

;(async () => {
  const names = process.argv.slice(2)
  if (!names.length) return console.log('用法: node scripts/check-names.cjs <名字1> <名字2> ...')
  const rows = []
  for (const n of names) {
    const [com, net, gh] = await Promise.all([domainFree(n, 'com'), domainFree(n, 'net'), githubFree(n)])
    rows.push({ 名字: n, '.com': mark(com), '.net': mark(net), GitHub: mark(gh) })
  }
  console.log('\n===== 品牌名占用检查 =====')
  for (const r of rows) {
    console.log(`\n【${r.名字}】`)
    console.log('  .com   ' + r['.com'])
    console.log('  .net   ' + r['.net'])
    console.log('  GitHub ' + r.GitHub)
  }
})()
