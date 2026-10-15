/**
 * 改名后的文案润色：把「钥匙窝 」多余空格去掉、补上英文名 YaoShiWo、版本升到 1.2.0、更新日志加一条改名说明。
 * 用法： node scripts/polish-brand.cjs
 */
const fs = require('fs')
const path = require('path')
const ROOT = path.join(__dirname, '..')

const EDITS = {
  'website/index.html': [
    ['<title>钥匙窝 密码管理器｜本地加密、不上传云端的 Windows 密码管理软件</title>',
     '<title>钥匙窝 YaoShiWo｜本地加密、不上传云端的 Windows 密码管理软件</title>'],
    ['content="钥匙窝 是一款免费的 Windows 密码管理器',
     'content="钥匙窝（YaoShiWo）是一款免费的 Windows 密码管理器'],
    ['Argon2,钥匙窝"', 'Argon2,钥匙窝,YaoShiWo"'],
    ['<meta name="author" content="钥匙窝" />', '<meta name="author" content="钥匙窝 YaoShiWo" />'],
    ['<meta property="og:site_name" content="钥匙窝 密码管理器" />',
     '<meta property="og:site_name" content="钥匙窝 YaoShiWo" />'],
    ['<meta property="og:title" content="钥匙窝 密码管理器｜',
     '<meta property="og:title" content="钥匙窝 YaoShiWo｜'],
    ['<meta property="og:image:alt" content="钥匙窝 密码管理器：',
     '<meta property="og:image:alt" content="钥匙窝 YaoShiWo：'],
    ['<meta name="twitter:title" content="钥匙窝 密码管理器｜本地加密、不上传云端" />',
     '<meta name="twitter:title" content="钥匙窝 YaoShiWo｜本地加密、不上传云端" />'],
    ['"name": "钥匙窝 密码管理器",', '"name": "钥匙窝 YaoShiWo",'],
    ['"alternateName": ["钥匙窝", "钥匙窝 密码管理软件"],',
     '"alternateName": ["YaoShiWo", "钥匙窝 密码管理器", "钥匙窝密码管理软件"],'],
    ['"softwareVersion": "1.1.0",', '"softwareVersion": "1.2.0",'],
    ['<span class="nav-ver">v1.1.0</span>', '<span class="nav-ver">v1.2.0</span>'],
    ['v1.1.0 已发布 · 4 处改动，日常用起来顺多了', 'v1.2.0 已发布 · 正式定名「钥匙窝」，日常更顺手'],
    ['<h2>v1.1.0：<span class="grad">4 处改动，日常顺多了</span></h2>',
     '<h2>v1.2.0：<span class="grad">改名「钥匙窝」，外加 4 处改动</span></h2>'],
    ['<p>这一版没加花哨的东西，只把每天都要碰到的地方磨顺了。</p>',
     '<p>软件正式定名 <b>钥匙窝</b>（英文 YaoShiWo）。功能和数据一律照旧：你的 .kdbx 文件、设置、浏览器扩展配对都不受影响。</p>'],
    ['      <article class="log-item reveal">\n        <span class="log-tag">01</span>',
     '      <article class="log-item reveal">\n        <span class="log-tag">00</span>\n        <div>\n          <h3>有了自己的名字：钥匙窝</h3>\n          <p>密码是钥匙，钥匙该待在自己家里。改名不改内核——依旧是本地加密、不上传云端、兼容 KeePass 的密码管理器，只是从此这个名字在搜索结果里只指向这一个官网。</p>\n        </div>\n      </article>\n      <article class="log-item reveal">\n        <span class="log-tag">01</span>'],
    // 中英混排多余空格
    ['钥匙窝 是', '钥匙窝是'],
    ['下面是 钥匙窝 处理', '下面是钥匙窝处理'],
    ['打开 钥匙窝 →', '打开钥匙窝 →'],
    ['是否保存到 钥匙窝？', '是否保存到钥匙窝？'],
    ['钥匙窝 选择把信任', '钥匙窝选择把信任'],
    ['运行的 钥匙窝（', '运行的钥匙窝（'],
    ['钥匙窝 没有账号系统', '钥匙窝没有账号系统'],
    ['钥匙窝 读写的是', '钥匙窝读写的是'],
    ['钥匙窝 只负责把文件写对', '钥匙窝只负责把文件写对'],
    ['<p class="footer-copy">© 2026 钥匙窝 · 本地优先的密码管理方案</p>',
     '<p class="footer-copy">© 2026 钥匙窝 YaoShiWo · 本地优先的密码管理方案</p>']
  ],
  'website/sitemap.xml': [
    ['<image:title>钥匙窝 密码管理器：你的密码，只属于你自己</image:title>',
     '<image:title>钥匙窝 YaoShiWo：你的密码，只属于你自己</image:title>']
  ]
}

for (const [rel, rules] of Object.entries(EDITS)) {
  const fp = path.join(ROOT, rel)
  let s = fs.readFileSync(fp, 'utf8')
  for (const [from, to] of rules) {
    if (!s.includes(from)) { console.log('  ⚠ 没找到（跳过）: ' + rel + ' :: ' + from.slice(0, 40)); continue }
    s = s.split(from).join(to)
  }
  fs.writeFileSync(fp, s, 'utf8')
  console.log('  ✓ ' + rel)
}
console.log('\n润色完成')
