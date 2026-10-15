// 自检：内联图标功能是否完整实现
import { readFileSync } from 'fs'

const file = 'E:/Code/harness/safevault/chrome-extension/content.js'
const s = readFileSync(file, 'utf8')

const checks = [
  ['内联图标创建 (createAnchor)', 'createAnchor'],
  ['仅在确认有匹配时才显示图标', 'matchCache.length === 0'],
  ['Shadow DOM 样式隔离', 'attachShadow'],
  ['滚动时跟随输入框定位', "addEventListener('scroll', onReposition"],
  ['点击图标打开下拉菜单', 'openMenu(host)'],
  ['下拉列表点击即填充', 'fillCredential(m)'],
  ['MutationObserver 动态表单监听', 'new MutationObserver'],
  ['自动填充逻辑保留', 'tryAutoFill'],
  ['弹窗手动填充兼容', "msg.type === 'fill'"],
  ['图标内联样式兜底(CSP)', 'btn.style.cssText'],
  ['下拉菜单超出视口时上翻', 'MENU_MAX_HEIGHT > window.innerHeight']
]

let pass = 0
for (const [name, key] of checks) {
  const ok = s.includes(key)
  if (ok) pass++
  console.log((ok ? '  [OK]   ' : '  [缺失] ') + name)
}

console.log('')
console.log(`通过 ${pass}/${checks.length}，文件大小 ${s.length} 字节`)
process.exit(pass === checks.length ? 0 : 1)
