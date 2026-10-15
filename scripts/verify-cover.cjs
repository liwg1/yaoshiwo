/**
 * 校验封面渲染结果（模型没有视觉能力，所以用像素统计代替"肉眼看图"）。
 *
 * 跑法：node node_modules/electron/cli.js scripts/verify-cover.cjs
 *
 * 对每个关键区域统计"亮像素"比例：
 *   文字/图标区域应该有明显亮像素（说明真的画出来了，没有被 background-clip 之类的属性弄成透明）；
 *   背景区域亮像素比例应该很低。
 */
const { app, BrowserWindow } = require('electron')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const COVER_DIR = path.join(ROOT, 'cover')
const SCALE = 2

app.setPath('userData', path.join(ROOT, '.cover-userdata'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE))

const MEASURE = `(() => {
  const r = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { sel, x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), text: (e.textContent || '').trim().slice(0, 24) };
  };
  return [r('.logo'), r('.brand'), r('.pill'), r('h1'), r('h1 em'), r('.sub'), r('.chips'), r('.chip')];
})()`

function stat(img, rect) {
  const size = img.getSize()
  const buf = img.toBitmap()
  const x0 = Math.max(0, Math.round(rect.x * SCALE))
  const y0 = Math.max(0, Math.round(rect.y * SCALE))
  const x1 = Math.min(size.width, Math.round((rect.x + rect.w) * SCALE))
  const y1 = Math.min(size.height, Math.round((rect.y + rect.h) * SCALE))
  let bright = 0
  let total = 0
  let peak = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size.width + x) * 4
      const c0 = buf[i], c1 = buf[i + 1], c2 = buf[i + 2]
      const m = Math.max(c0, c1, c2)
      if (m > peak) peak = m
      if (m > 150) bright++
      total++
    }
  }
  return { bright, total, peak, ratio: total ? bright / total : 0 }
}

async function run(html, title) {
  const win = new BrowserWindow({
    width: html.includes('1x1') ? 400 : 900,
    height: html.includes('1x1') ? 400 : 383,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#0b1220',
    webPreferences: { backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })
  await win.loadFile(path.join(COVER_DIR, html))
  await new Promise((r) => setTimeout(r, 900))

  const rects = (await win.webContents.executeJavaScript(MEASURE)).filter(Boolean)
  const img = await win.webContents.capturePage()
  const size = img.getSize()
  console.log('\n=== ' + title + ' (' + size.width + 'x' + size.height + ') ===')
  for (const r of rects) {
    const s = stat(img, r)
    const ok = s.peak > 150
    console.log(
      '  ' + (ok ? '✓' : '✗') + ' ' + r.sel.padEnd(10) +
      ' 亮像素 ' + String(s.bright).padStart(6) + '/' + String(s.total).padStart(6) +
      ' (' + (s.ratio * 100).toFixed(1) + '%)  峰值 ' + s.peak +
      '  @' + r.x + ',' + r.y + ' ' + r.w + 'x' + r.h + '  "' + r.text + '"'
    )
  }
  // 右下角空白背景作为对照
  const bg = stat(img, { x: size.width / SCALE - 90, y: size.height / SCALE - 60, w: 70, h: 40 })
  console.log('  · 对照背景区 亮像素比例 ' + (bg.ratio * 100).toFixed(1) + '%  峰值 ' + bg.peak)
  win.destroy()
}

app.whenReady().then(async () => {
  await run('cover-235.html', '公众号首图 2.35:1')
  await run('cover-1x1.html', '公众号小图 1:1')
  app.exit(0)
})

app.on('window-all-closed', () => {})
