const https = require('https')
const http = require('http')
const fs = require('fs')
const path = require('path')

const version = process.argv[2] || '33.4.11'
const url = `https://npmmirror.com/mirrors/electron/v${version}/electron-v${version}-win32-x64.zip`
const outDir = path.join(__dirname, '..', '.electron-cache')
const out = path.join(outDir, `electron-v${version}-win32-x64.zip`)

fs.mkdirSync(outDir, { recursive: true })

function get(u, redirects = 0) {
  return new Promise((resolve, reject) => {
    const mod = u.startsWith('https') ? https : http
    mod
      .get(u, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirects < 10
        ) {
          res.resume()
          resolve(get(new URL(res.headers.location, u).toString(), redirects + 1))
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`))
          return
        }
        resolve(res)
      })
      .on('error', reject)
  })
}

async function main() {
  console.log('Downloading', url)
  const res = await get(url)
  const total = Number(res.headers['content-length'] || 0)
  let received = 0
  const file = fs.createWriteStream(out)
  res.on('data', (c) => {
    received += c.length
    if (total) {
      process.stdout.write(
        `\r${Math.round((received / total) * 100)}%  (${(received / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB)`
      )
    }
  })
  res.pipe(file)
  await new Promise((resolve, reject) => {
    file.on('finish', resolve)
    file.on('error', reject)
  })
  console.log('\nDone:', out)
  console.log('Size:', (fs.statSync(out).size / 1048576).toFixed(1), 'MB')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
