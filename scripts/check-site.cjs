/**
 * 官网页面自检（模型没有视觉能力，用几何测量 + 像素统计代替"肉眼看网页"）。
 *
 * 跑法：node node_modules/electron/cli.js scripts/check-site.cjs
 *
 * 做四件事：
 *   1. 在多个宽度下检查是否有横向溢出 / 元素超出视口；
 *   2. 收集控制台报错与加载失败（404）的资源；
 *   3. 滚动整页后确认所有 .reveal 元素都真的显示出来了（opacity=1）；
 *   4. 生成整页截图到 website/preview/，方便人眼快速看效果。
 */
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const HTTP_ARG = process.argv.find((a) => /^https?:\/\//.test(a))
const SITE = HTTP_ARG || path.join(ROOT, 'website', 'index.html')
const OUT_DIR = path.join(ROOT, 'website', 'preview')

/* 既可以查本地文件，也可以查已经起好的 http 预览（真实部署环境一致）：
   node node_modules/electron/cli.js scripts/check-site.cjs
   node node_modules/electron/cli.js scripts/check-site.cjs http://127.0.0.1:8125/ */
async function openSite(win) {
  if (HTTP_ARG) await win.loadURL(SITE)
  else await win.loadFile(path.join(ROOT, 'website', 'index.html'))
}

app.setPath('userData', path.join(ROOT, '.site-check-userdata'))
app.disableHardwareAcceleration()

const WIDTHS = [1440, 1280, 1024, 768, 390]
const SHOT_WIDTHS = [1440, 390]

const problems = []

/* ---------- 页面内测量脚本 ---------- */
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, over: [], hidden: [], counts: {} };

  document.querySelectorAll('body *').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    // 允许装饰性元素（orb/glow/grid/canvas）溢出，它们本来就要出血
    const deco = el.classList.contains('orb') || el.classList.contains('hero-grid') || el.classList.contains('hero-canvas') || el.classList.contains('glow');
    if (deco) return;
    if (r.right > vw + 1.5 || r.left < -1.5) {
      const name = el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
      out.over.push(name + ' [' + Math.round(r.left) + '..' + Math.round(r.right) + ']');
    }
  });

  // 隐藏窗口里页面处于 hidden 状态、没有合成帧，IntersectionObserver 只在首帧投递一次，
  // 所以滚动后下面那些元素拿不到 .in —— 这是测量环境的限制，不是网页 bug（首屏那一批拿到了 .in 就证明
  // observer 接线正常）。这里把剩下的手动补上，等价于真实浏览器滚动到该位置时的结果，然后再量 opacity。
  out.naturalReveal = document.querySelectorAll('.reveal.in').length;
  document.querySelectorAll('.reveal:not(.in)').forEach((el) => el.classList.add('in'));

  document.querySelectorAll('.reveal').forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (parseFloat(cs.opacity) < 0.9) {
      out.hidden.push((el.className || ('#' + i)).slice(0, 60) + ' opacity=' + cs.opacity);
    }
  });

  ['nav', 'heroCanvas', 'stats'].forEach((id) => {
    const el = document.getElementById(id);
    out.counts[id] = el ? Math.round(el.getBoundingClientRect().height) : -1;
  });
  out.counts.sections = document.querySelectorAll('section').length;
  out.counts.cards = document.querySelectorAll('.card').length;
  out.counts.faq = document.querySelectorAll('.faq details').length;
  out.counts.reveal = document.querySelectorAll('.reveal').length;
  out.counts.canvasW = (() => { const c = document.getElementById('heroCanvas'); return c ? c.width : -1 })();
  return out;
})()`

/* ---------- 像素统计：区域里有没有"画出来"的东西 ---------- */
function brightRatio(img, rect) {
  const size = img.getSize()
  const buf = img.toBitmap()
  const x0 = Math.max(0, Math.min(size.width - 1, Math.round(rect.x)))
  const y0 = Math.max(0, Math.min(size.height - 1, Math.round(rect.y)))
  const x1 = Math.max(x0 + 1, Math.min(size.width, Math.round(rect.x + rect.w)))
  const y1 = Math.max(y0 + 1, Math.min(size.height, Math.round(rect.y + rect.h)))
  let bright = 0
  let total = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * size.width + x) * 4
      if (Math.max(buf[i], buf[i + 1], buf[i + 2]) > 140) bright++
      total++
    }
  }
  return total ? bright / total : 0
}

function hookConsole(win, label) {
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) {
      problems.push('[' + label + '] 控制台: ' + message + ' @' + String(source).replace(/.*[\\/]/, '') + ':' + line)
    }
  })
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    problems.push('[' + label + '] 加载失败 ' + code + ' ' + desc + ' → ' + url)
  })
  win.webContents.on('did-fail-load', () => {})
  win.webContents.on('render-process-gone', (_e, details) => {
    problems.push('[' + label + '] 渲染进程退出: ' + JSON.stringify(details))
  })
}

/* 隐藏窗口里 CSS transition 不会推进（没有合成帧），会导致 .reveal 永远停在 opacity:0。
   测量与截图前先关掉 transition/animation，让样式立即生效，结果才反映真实布局。 */
const FREEZE = '*{transition:none !important;animation:none !important;}'

async function measureAt(width) {
  const win = new BrowserWindow({
    width,
    height: 900,
    useContentSize: true,
    show: false,
    backgroundColor: '#070d1a',
    webPreferences: { backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })
  hookConsole(win, width + 'px')
  await openSite(win)
  await win.webContents.insertCSS(FREEZE)
  await new Promise((r) => setTimeout(r, 700))

  // 滚遍全页，触发所有出现动画
  await win.webContents.executeJavaScript(`(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 500));
    return true;
  })()`)

  const m = await win.webContents.executeJavaScript(MEASURE)
  console.log('\n=== 宽度 ' + width + 'px ===')
  console.log('  页面宽 scrollW=' + m.scrollW + ' / clientW=' + m.vw + (m.scrollW > m.vw + 1 ? '  ✗ 横向溢出' : '  ✓ 无横向溢出'))
  console.log('  页面高 ' + m.scrollH + 'px')
  console.log('  结构  section=' + m.counts.sections + ' 功能卡=' + m.counts.cards + ' FAQ=' + m.counts.faq + ' reveal=' + m.counts.reveal)
  console.log('  canvas 位图宽 ' + m.counts.canvasW + '  导航高 ' + m.counts.nav)
  if (m.over.length) {
    console.log('  ✗ 超出视口的元素 ' + m.over.length + ' 个:')
    m.over.slice(0, 12).forEach((s) => console.log('      ' + s))
    problems.push('[' + width + 'px] ' + m.over.length + ' 个元素横向超出视口')
  } else {
    console.log('  ✓ 所有元素都在视口宽度内')
  }
  if (m.hidden.length) {
    console.log('  ✗ 补齐 .in 后仍不可见的 .reveal: ' + m.hidden.length)
    m.hidden.slice(0, 8).forEach((s) => console.log('      ' + s))
    problems.push('[' + width + 'px] ' + m.hidden.length + ' 个 .reveal 元素补齐后仍不可见（CSS 有问题）')
  } else {
    console.log('  ✓ 全部 ' + m.counts.reveal + ' 个 .reveal 元素显示正常（首帧自然触发 ' + m.naturalReveal + ' 个）')
  }

  win.destroy()
  return m
}

async function fullShot(width, name) {
  const win = new BrowserWindow({
    width,
    height: 1000,
    useContentSize: true,
    show: false,
    backgroundColor: '#070d1a',
    webPreferences: { backgroundThrottling: false, paintWhenInitiallyHidden: true }
  })
  hookConsole(win, 'shot-' + width)
  await openSite(win)
  await win.webContents.insertCSS(FREEZE)
  await new Promise((r) => setTimeout(r, 600))

  let h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight')
  win.setContentSize(width, Math.min(h + 20, 14000))
  await new Promise((r) => setTimeout(r, 900))
  h = await win.webContents.executeJavaScript('document.documentElement.scrollHeight')
  win.setContentSize(width, Math.min(h + 20, 14000))
  await new Promise((r) => setTimeout(r, 900))

  // 隐藏窗口里滚动不会触发 IntersectionObserver，截图前直接把出现动画补齐，
  // 这样整页截图展示的就是用户在真实浏览器里滚完整页后看到的样子。
  await win.webContents.executeJavaScript(`(async () => {
    document.querySelectorAll('.reveal:not(.in)').forEach((el) => el.classList.add('in'));
    await new Promise((r) => setTimeout(r, 300));
    window.scrollTo(0, 0);
    return true;
  })()`)

  const img = await win.webContents.capturePage()
  const size = img.getSize()
  const file = path.join(OUT_DIR, name)
  fs.writeFileSync(file, img.toPNG())

  const hero = brightRatio(img, { x: 40, y: 120, w: width - 80, h: 260 })
  const stats = await win.webContents.executeJavaScript(`(() => { const r = document.getElementById('stats').getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } })()`)
  const statsRatio = brightRatio(img, stats)
  console.log('\n=== 整页截图 ' + name + ' ===')
  console.log('  尺寸 ' + size.width + 'x' + size.height + '  文件 ' + Math.round(fs.statSync(file).size / 1024) + ' KB')
  console.log('  首屏区域亮像素 ' + (hero * 100).toFixed(1) + '%  ' + (hero > 0.01 ? '✓ 有内容' : '✗ 疑似空白'))
  console.log('  数据条区域亮像素 ' + (statsRatio * 100).toFixed(1) + '%  ' + (statsRatio > 0.01 ? '✓ 有内容' : '✗ 疑似空白'))
  if (hero <= 0.01) problems.push('[' + width + 'px] 首屏疑似空白')
  win.destroy()
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  session.defaultSession.webRequest.onErrorOccurred((details) => {
    if (/^file:/.test(details.url)) {
      problems.push('资源加载失败: ' + details.error + ' → ' + details.url.replace(/^.*website/, 'website'))
    }
  })

  for (const w of WIDTHS) await measureAt(w)
  for (const w of SHOT_WIDTHS) await fullShot(w, 'preview-' + w + '.png')

  console.log('\n================ 汇总 ================')
  if (!problems.length) {
    console.log('✅ 未发现问题：无横向溢出、无控制台报错、无资源加载失败、动画元素均正常显示')
  } else {
    console.log('发现 ' + problems.length + ' 个问题：')
    problems.forEach((p) => console.log('  · ' + p))
  }
  app.exit(problems.length ? 2 : 0)
})

app.on('window-all-closed', () => {})
