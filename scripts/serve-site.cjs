/* 官网本地预览服务器（纯 Node，零依赖）
   用法: node scripts/serve-site.cjs [端口]
   默认 http://127.0.0.1:8125 —— 与真实部署一致（正确的 MIME 类型、目录索引），
   这样点「下载」按钮的行为也和上线后一样。
*/
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'website')
const PORT = Number(process.argv[2] || 8125)
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.zip': 'application/zip',
  '.exe': 'application/octet-stream',
  '.woff2': 'font/woff2'
}

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0])
  if (rel === '/' || rel === '') rel = '/index.html'
  const file = path.join(ROOT, path.normalize(rel).replace(/^([/\\])+/, ''))
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden')
    return
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 not found: ' + rel)
      console.log('404 ' + rel)
      return
    }
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache'
    })
    fs.createReadStream(file).pipe(res)
    console.log('200 ' + rel + '  ' + (st.size / 1024).toFixed(1) + ' KB')
  })
})

server.listen(PORT, HOST, () => {
  console.log('SafeVault 官网预览已启动: http://' + HOST + ':' + PORT + '/')
  console.log('站点根目录: ' + ROOT)
})
