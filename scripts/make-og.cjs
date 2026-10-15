/**
 * 生成官网社交分享图 og-cover.png（1200×630），供微信 / QQ / GitHub / 搜索引擎抓取使用。
 *
 * 跑法：node node_modules/electron/cli.js scripts/make-og.cjs
 * 输出：website/assets/img/og-cover.png（1200×630，1 倍图，社交平台都按这个尺寸取）
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SOURCE = path.join(ROOT, 'cover', 'og-1200x630.html')
const OUT = path.join(ROOT, 'website', 'assets', 'img', 'og-cover.png')
const W = 1200
const H = 630

app.setPath('userData', path.join(ROOT, '.cover-userdata'))
app.disableHardwareAcceleration()

const MEASURE = `(() => {
  const out = [];
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
      out.push('OVERFLOW ' + name + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.right) + ',' + Math.round(r.bottom) + ']');
    }
  });
  out.push('scroll=' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight + ' viewport=' + vw + 'x' + vh);
  return out.join('\\n');
})()`

/* 统计各关键区域的亮像素比例，代替"肉眼看图" */
const PIXELS = `(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  };
  return { logo: pick('.logo'), h1: pick('h1'), sub: pick('.sub'), chips: pick('.bottom'), brand: pick('.brand') };
})()`

function brightRatio(img, rect) {
  const size = img.getSize()
  const buf = img.toBitmap()
  const x0 = Math.max(0, Math.min(size.width - 1, rect.x))
  const y0 = Math.max(0, Math.min(size.height - 1, rect.y))
  const x1 = Math.max(x0 + 1, Math.min(size.width, rect.x + rect.w))
  const y1 = Math.max(y0 + 1, Math.min(size.height, rect.y + rect.h))
  let bright = 0
  let total = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size.width + x) * 4
      if (Math.max(buf[i], buf[i + 1], buf[i + 2]) > 150) bright++
      total++
    }
  }
  return total ? bright / total : 0
}

async function shoot() {
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#0b1220',
    webPreferences: { backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })
  await win.loadFile(SOURCE)
  await new Promise((r) => setTimeout(r, 1000))
  console.log('布局检查:\n' + (await win.webContents.executeJavaScript(MEASURE)))
  const rects = await win.webContents.executeJavaScript(PIXELS)
  const img = await win.webContents.capturePage()
  const size = img.getSize()
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, img.toPNG())

  console.log('\n像素校验（亮像素比例，0% 说明这块没画出来）:')
  for (const key of Object.keys(rects)) {
    if (!rects[key]) { console.log('  ' + key + ': 未找到元素'); continue }
    console.log('  ' + key.padEnd(6) + ' ' + (brightRatio(img, rects[key]) * 100).toFixed(1) + '%')
  }
  console.log('\n输出 ' + size.width + 'x' + size.height + ' → ' + OUT + '  ' + (fs.statSync(OUT).size / 1024).toFixed(1) + ' KB')
  win.destroy()
}

app.whenReady().then(async () => {
  await shoot()
  app.exit(0)
})
app.on('window-all-closed', () => {})
