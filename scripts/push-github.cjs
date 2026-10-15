// 把当前仓库推送到 GitHub（自动建仓库 + 推送 + 打印后续步骤）。
//
// GitHub 从 2021 年起彻底关闭了「密码认证」，API 和 git 推送都只认 Personal Access Token，
// 所以这里必须用令牌：
//
//   1. GitHub → 头像 → Settings → Developer settings → Personal access tokens → Tokens (classic)
//   2. Generate new token (classic)，勾选 repo（要发 Releases 就再勾 workflow 不需要，repo 足够）
//   3. 复制 ghp_xxx
//
// 用法（令牌只从环境变量读，不写进任何文件、也不留在 .git/config 里）：
//   $env:GITHUB_TOKEN='ghp_xxx'
//   node scripts/push-github.cjs                 # 默认推到 liwg1/yaoshiwo
//   node scripts/push-github.cjs liwg1/其他名字   # 也可指定别的仓库名
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const REPO = process.argv[2] || 'liwg1/yaoshiwo'
const [OWNER, NAME] = REPO.split('/')
const API = 'https://api.github.com'

if (!TOKEN) {
  console.error('缺少环境变量 GITHUB_TOKEN（Personal Access Token，勾选 repo 权限）')
  process.exit(2)
}
if (!OWNER || !NAME) {
  console.error('仓库名格式应为 owner/repo')
  process.exit(2)
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'yaoshiwo-release',
  'X-GitHub-Api-Version': '2022-11-28'
}

const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim()

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json, text }
}

;(async () => {
  console.log('1) 校验令牌 …')
  const me = await api('/user')
  if (me.status !== 200) {
    console.error(`   令牌无效（HTTP ${me.status}）：${me.text.slice(0, 160)}`)
    process.exit(1)
  }
  const login = me.json.login
  console.log(`   已登录：${login}`)
  if (login.toLowerCase() !== OWNER.toLowerCase()) {
    console.log(`   注意：令牌属于 ${login}，但目标仓库是 ${OWNER}/${NAME}，将按 ${login} 的身份操作`)
  }

  console.log(`2) 确认仓库 ${OWNER}/${NAME} 是否存在 …`)
  const exists = await api(`/repos/${OWNER}/${NAME}`)
  if (exists.status === 404) {
    console.log('   不存在，开始创建（公开仓库）…')
    const created = await api('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: NAME,
        description: '钥匙窝 YaoShiWo：本地优先、不上传云端的 Windows 密码管理器，兼容 KeePass 2 的 .kdbx',
        homepage: 'https://yaoshiwo.cn',
        private: false,
        has_issues: true,
        has_wiki: false,
        has_projects: false,
        has_downloads: true
      })
    })
    if (created.status !== 201) {
      console.error(`   创建失败（HTTP ${created.status}）：${created.text.slice(0, 300)}`)
      process.exit(1)
    }
    console.log('   已创建：' + created.json.html_url)
  } else if (exists.status === 200) {
    console.log('   仓库已存在：' + exists.json.html_url)
  } else {
    console.error(`   检查仓库失败（HTTP ${exists.status}）：${exists.text.slice(0, 200)}`)
    process.exit(1)
  }

  console.log('3) 确认本地仓库状态 …')
  try {
    git(['rev-parse', '--is-inside-work-tree'])
  } catch {
    console.error('   当前目录不是 git 仓库，先执行：git init && git add -A && git commit')
    process.exit(1)
  }
  const dirty = git(['status', '--porcelain'])
  if (dirty) {
    console.log('   工作区有未提交改动，先提交：')
    console.log(dirty.split('\n').slice(0, 10).map((l) => '     ' + l).join('\n'))
    console.error('   请先 git commit 再推送（避免把半成品推上去）')
    process.exit(1)
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  console.log(`   分支：${branch}，提交：${git(['log', '--oneline', '-1'])}`)

  console.log('4) 推送 …')
  const pushUrl = `https://x-access-token:${TOKEN}@github.com/${OWNER}/${NAME}.git`
  try {
    execFileSync('git', ['push', pushUrl, `${branch}:main`, '--force'], { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.error('   推送失败。常见原因：令牌没勾 repo 权限、令牌过期、或仓库名与所有者不匹配。')
    process.exit(1)
  }
  // 远端地址只留干净 URL，绝不把令牌写进 .git/config
  try {
    git(['remote', 'remove', 'origin'])
  } catch {
    /* 没有 origin 也无所谓 */
  }
  git(['remote', 'add', 'origin', `https://github.com/${OWNER}/${NAME}.git`])
  console.log('   已推送，并设置 origin = https://github.com/' + OWNER + '/' + NAME + '.git（不含令牌）')

  console.log('\n完成：https://github.com/' + OWNER + '/' + NAME)
  console.log('\n还剩一件事需要手动做（GitHub 不允许用 API 传 100MB 以上文件，虽然我们的包是 80MB 可以传，')
  console.log('但二进制不该进仓库）：把两个安装包作为 Release 附件上传')
  console.log('  1. 打开 https://github.com/' + OWNER + '/' + NAME + '/releases/new')
  console.log('  2. Tag 填 v1.2.0，标题填「钥匙窝 v1.2.0：改名 + 4 处改动」')
  console.log('  3. 上传 release\\YaoShiWo-Setup-1.2.0.exe 和 release\\YaoShiWo-portable.exe')
  console.log('  4. 发布后把 README 里的 Releases 链接换成真实地址')
})()
