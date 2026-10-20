/**
 * 生成微信公众号文章的配图（Electron 自带 Chromium 渲染，中文用系统「微软雅黑」）
 *
 * 跑法：
 *   node node_modules/electron/cli.js scripts/render-wechat-images.cjs
 *
 * 源文件：docs/wechat-images/src/*.html
 * 输出：  docs/wechat-images/*.png（@2x，公众号后台直接上传即可）
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'docs', 'wechat-images', 'src')
const OUT = path.join(ROOT, 'docs', 'wechat-images')
const SCALE = 2

// 不碰用户真实的数据库目录
app.setPath('userData', path.join(ROOT, '.render-userdata'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE))
app.commandLine.appendSwitch('high-dpi-support', '1')

const TARGETS = [
  { html: '01-cover.html', out: '01-cover.png', width: 900, height: 383 },
  { html: '02-timeline.html', out: '02-timeline.png', width: 900, height: 620 },
  { html: '03-extension-steps.html', out: '03-extension-steps.png', width: 900, height: 640 },
  { html: '04-site-pipeline.html', out: '04-site-pipeline.png', width: 900, height: 540 },
  { html: '05-ending.html', out: '05-ending.png', width: 900, height: 420 }
]

/** 检查元素是否溢出画布，避免截出来是残的 */
const MEASURE = `(() => {
  const out = [];
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  document.querySelectorAll('body *').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const name = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) {
      out.push('OVERFLOW ' + name + ' [' + Math.round(r.left) + ',' + Math.round(r.top) + ',' + Math.round(r.right) + ',' + Math.round(r.bottom) + '] viewport=' + vw + 'x' + vh);
    }
  });
  out.push('scroll=' + document.documentElement.scrollWidth + 'x' + document.documentElement.scrollHeight + ' viewport=' + vw + 'x' + vh);
  return out.join('\\n');
})()`

function looksBlank(img) {
  try {
    const buf = img.toBitmap()
    if (!buf || buf.length < 64) return false
    const first = [buf[0], buf[1], buf[2], buf[3]]
    for (let i = 4; i + 3 < buf.length; i += 4 * 97) {
      if (buf[i] !== first[0] || buf[i + 1] !== first[1] || buf[i + 2] !== first[2]) return false
    }
    return true
  } catch {
    return false
  }
}

async function render(target) {
  const win = new BrowserWindow({
    width: target.width,
    height: target.height,
    useContentSize: true,
    show: false,
    frame: false,
    backgroundColor: '#0b1220',
    webPreferences: { backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })

  await win.loadFile(path.join(SRC, target.html))
  await new Promise((r) => setTimeout(r, 900)) // 等字体与渐变稳定

  const report = await win.webContents.executeJavaScript(MEASURE)
  const bad = report.split('\n').filter((l) => l.startsWith('OVERFLOW'))
  console.log('[' + target.html + '] ' + (bad.length ? '⚠ ' + bad.join('; ') : '布局正常'))

  let img = await win.webContents.capturePage()
  if (looksBlank(img)) {
    console.log('[' + target.html + '] 首帧疑似空白，重试…')
    await new Promise((r) => setTimeout(r, 1200))
    img = await win.webContents.capturePage()
  }

  const size = img.getSize()
  fs.writeFileSync(path.join(OUT, target.out), img.toPNG())
  console.log('[' + target.html + '] → ' + target.out + ' (' + size.width + '×' + size.height + ')')
  win.destroy()
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  for (const t of TARGETS) await render(t)
  console.log('\n配图已生成到: ' + OUT)
  app.exit(0)
})

app.on('window-all-closed', () => {})
