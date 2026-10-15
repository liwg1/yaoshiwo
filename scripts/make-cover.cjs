/**
 * 生成微信公众号文章封面（用 Electron 自带的 Chromium 渲染，中文用系统「微软雅黑」）。
 *
 * 跑法：
 *   node node_modules/electron/cli.js scripts/make-cover.cjs
 *
 * 输出（cover/ 目录）：
 *   cover-235@2x.png  1800×766  （2.35:1，公众号首图，直接上传这张）
 *   cover-235@1x.png   900×383
 *   cover-1x1@2x.png   800×800  （1:1 小图/缩略图）
 *   cover-1x1@1x.png   400×400
 */
const { app, BrowserWindow } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const COVER_DIR = path.join(ROOT, 'cover')
const SCALE = 2

// 不要碰用户真正的 SafeVault 数据目录
app.setPath('userData', path.join(ROOT, '.cover-userdata'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('force-device-scale-factor', String(SCALE))
app.commandLine.appendSwitch('high-dpi-support', '1')

const TARGETS = [
  { html: 'cover-235.html', out: 'cover-235', width: 900, height: 383, oneX: 900 },
  { html: 'cover-1x1.html', out: 'cover-1x1', width: 400, height: 400, oneX: 400 }
]

/** 检查元素是否溢出裁剪，返回可读的布局报告 */
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

/** 粗略判断图片是不是"空白"（整幅同色 / 全透明） */
function looksBlank(img) {
  try {
    const buf = img.toBitmap()
    if (!buf || buf.length < 64) return false
    const first = [buf[0], buf[1], buf[2], buf[3]]
    let same = true
    for (let i = 4; i + 3 < buf.length; i += 4 * 97) {
      if (buf[i] !== first[0] || buf[i + 1] !== first[1] || buf[i + 2] !== first[2]) { same = false; break }
    }
    if (same && first[3] === 0) return true
    if (same) return true
    return false
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
    webPreferences: { offscreen: false, backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })
  await win.loadFile(path.join(COVER_DIR, target.html))
  await new Promise((r) => setTimeout(r, 900)) // 等字体与渐变稳定

  const report = await win.webContents.executeJavaScript(MEASURE)
  console.log('[' + target.html + '] 布局检查:\n' + report)

  let img = await win.webContents.capturePage()
  if (looksBlank(img)) {
    console.log('[' + target.html + '] 首帧疑似空白，改用离屏模式重试…')
    win.destroy()
    const off = new BrowserWindow({
      width: target.width, height: target.height, useContentSize: true, show: false, frame: false,
      webPreferences: { offscreen: true, backgroundThrottling: false, paintWhenInitiallyHidden: true }
    })
    await off.loadFile(path.join(COVER_DIR, target.html))
    await new Promise((r) => setTimeout(r, 1200))
    img = await off.webContents.capturePage()
    const offSize = img.getSize()
    fs.writeFileSync(path.join(COVER_DIR, target.out + '@2x.png'), img.toPNG())
    fs.writeFileSync(path.join(COVER_DIR, target.out + '@1x.png'), img.resize({ width: target.oneX, quality: 'best' }).toPNG())
    console.log('[' + target.html + '] 输出 ' + offSize.width + 'x' + offSize.height + ' → ' + target.out + '@2x.png / @1x.png')
    off.destroy()
    return
  }

  const size = img.getSize()
  fs.writeFileSync(path.join(COVER_DIR, target.out + '@2x.png'), img.toPNG())
  const oneX = img.resize({ width: target.oneX, quality: 'best' })
  fs.writeFileSync(path.join(COVER_DIR, target.out + '@1x.png'), oneX.toPNG())
  console.log('[' + target.html + '] 输出 ' + size.width + 'x' + size.height + ' → ' + target.out + '@2x.png / @1x.png')
  win.destroy()
}

app.whenReady().then(async () => {
  for (const t of TARGETS) {
    await render(t)
  }
  console.log('\n封面已生成到: ' + COVER_DIR)
  app.exit(0)
})

// 关掉第一张图的窗口后不要自动退出（默认行为会 quit，导致第二张图加载失败）
app.on('window-all-closed', () => {})
