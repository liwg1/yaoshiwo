// 程序化生成 SafeVault 图标：应用 icon.ico/icon.png + Chrome 扩展多尺寸图标
import { deflateSync, crc32 } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 盾牌多边形（归一化坐标，y 向下）
const SHIELD = [
  [0.30, 0.16],
  [0.70, 0.16],
  [0.70, 0.50],
  [0.50, 0.86],
  [0.30, 0.50]
]

function pointInPolygon(px, py, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function inRoundedSquare(x, y, r = 0.22) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0)
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0)
  return dx * dx + dy * dy <= r * r
}

function sample(nx, ny) {
  if (!inRoundedSquare(nx, ny)) return [0, 0, 0, 0]
  const t = ny
  const r = Math.round(59 + (29 - 59) * t)
  const g = Math.round(118 + (79 - 118) * t)
  const b = Math.round(246 + (216 - 246) * t)
  if (pointInPolygon(nx, ny, SHIELD)) return [255, 255, 255, 255]
  return [r, g, b, 255]
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function buildPng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const idat = deflateSync(rgba, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

function renderPng(size) {
  const ss = size <= 48 ? 4 : 2 // 小尺寸用更高超采样，边缘更干净
  const n = ss * ss
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const nx = (x + (sx + 0.5) / ss) / size
          const ny = (y + (sy + 0.5) / ss) / size
          const [cr, cg, cb, ca] = sample(nx, ny)
          r += cr
          g += cg
          b += cb
          a += ca
        }
      }
      const off = y * (size * 4 + 1) + 1 + x * 4
      raw[off] = Math.round(r / n)
      raw[off + 1] = Math.round(g / n)
      raw[off + 2] = Math.round(b / n)
      raw[off + 3] = Math.round(a / n)
    }
  }
  return buildPng(size, size, raw)
}

function buildIco(png256) {
  const icondir = Buffer.alloc(6)
  icondir.writeUInt16LE(0, 0)
  icondir.writeUInt16LE(1, 2)
  icondir.writeUInt16LE(1, 4)
  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png256.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([icondir, entry, png256])
}

const buildDir = join(__dirname, '..', 'build')
const extIconDir = join(__dirname, '..', 'chrome-extension', 'icons')
mkdirSync(buildDir, { recursive: true })
mkdirSync(extIconDir, { recursive: true })

const png256 = renderPng(256)
writeFileSync(join(buildDir, 'icon.png'), png256)
writeFileSync(join(buildDir, 'icon.ico'), buildIco(png256))

for (const size of [16, 48, 128]) {
  writeFileSync(join(extIconDir, `icon${size}.png`), renderPng(size))
}

console.log('图标生成完成：build/icon.ico + chrome-extension/icons/icon{16,48,128}.png')
