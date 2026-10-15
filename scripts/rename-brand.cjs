/**
 * 品牌改名：SafeVault → 钥匙窝（YaoShiWo）
 * 只改「用户看得见」的文案与产物名；内部标识（localStorage 键、data-safevault 属性、
 * X-SafeVault-Token 协议头、userData 目录、TS 类型名）一律不动，避免丢设置/坏兼容。
 * 用法： node scripts/rename-brand.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')

const FILES = [
  'src/renderer/index.html',
  'src/renderer/src/App.tsx',
  'src/renderer/src/components/CloseGuard.tsx',
  'src/renderer/src/components/SettingsPanel.tsx',
  'src/renderer/src/components/MainLayout.tsx',
  'src/renderer/src/components/UnlockScreen.tsx',
  'src/renderer/src/store/vault.ts',
  'chrome-extension/manifest.json',
  'chrome-extension/popup.html',
  'chrome-extension/popup.js',
  'chrome-extension/content.js',
  'chrome-extension/README.md',
  'website/index.html',
  'website/sitemap.xml',
  'website/robots.txt',
  'website/README.md',
  'website/DEPLOY.md',
  'website/download/README.txt',
  'website/assets/js/main.js',
  'website/assets/css/style.css',
  'cover/cover-235.html',
  'cover/cover-1x1.html',
  'cover/og-1200x630.html'
]

// 顺序很重要：先处理带文件名/版本号的精确串，再做通用替换
const RULES = [
  ['SafeVault-Setup-1.1.0.exe', 'YaoShiWo-Setup-1.2.0.exe'],
  ['SafeVault Setup 1.1.0.exe', 'YaoShiWo-Setup-1.2.0.exe'],
  ['SafeVault-portable.exe', 'YaoShiWo-portable.exe'],
  ['SafeVault 密码管理器', '钥匙窝 密码管理器'],
  ['SafeVault', '钥匙窝'],
  // 站点部署路径/仓库名（仅文档里出现）
  ['safevault-website', 'yaoshiwo-website'],
  ['/var/www/safevault', '/var/www/yaoshiwo'],
  ['safevault.conf', 'yaoshiwo.conf']
]

let touched = 0
const report = []
for (const rel of FILES) {
  const fp = path.join(ROOT, rel)
  if (!fs.existsSync(fp)) { report.push('  跳过（不存在）: ' + rel); continue }
  const before = fs.readFileSync(fp, 'utf8')
  let after = before
  for (const [from, to] of RULES) after = after.split(from).join(to)
  if (after !== before) {
    fs.writeFileSync(fp, after, 'utf8')
    const n = RULES.reduce((acc, [from]) => acc + before.split(from).length - 1, 0)
    touched++
    report.push('  改 ' + rel + '  （命中 ' + n + ' 处）')
  } else {
    report.push('  未变 ' + rel)
  }
}
console.log('===== 改名结果（SafeVault → 钥匙窝 / YaoShiWo）=====')
console.log(report.join('\n'))
console.log('\n共修改 ' + touched + ' 个文件')
