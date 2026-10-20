// 把当前仓库推送到 GitHub：建仓库 → 加 SSH 钥匙 → 推送 → 设置仓库信息。
//
// 为什么不用账号密码：
//   GitHub 从 2021 年起关闭了「密码认证」，git 推送和 API 都只认 Personal Access Token。
// 为什么用 SSH 而不是 https：
//   国内网络下 github.com:443 经常连不上（api.github.com 却通），而 22 端口和 ssh.github.com:443 能连，
//   所以推送走 SSH，建仓库走 API。
//
// 用法：
//   1. 生成令牌：https://github.com/settings/tokens → Generate new token (classic)
//      勾选 repo（建仓库/推送）和 admin:public_key（自动加 SSH 钥匙）
//   2. $env:GITHUB_TOKEN='ghp_xxx'
//   3. $env:SAFEVAULT_SSH_KEY='E:\Code\harness\.gitkeys\id_ed25519_yaoshiwo'   # 可选，默认 ~/.ssh/id_ed25519
//   4. node scripts/push-github.cjs                # 默认推到 liwg1/yaoshiwo
//      node scripts/push-github.cjs liwg1/其他名    # 也可指定别的仓库名
//
// 令牌只从环境变量读，不写进任何文件，也不留在 .git/config 里；推送完 origin 只保留干净 URL。
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const REPO = process.argv[2] || 'liwg1/yaoshiwo'
const [OWNER, NAME] = REPO.split('/')
const API = 'https://api.github.com'
const KEY = process.env.SAFEVAULT_SSH_KEY || path.join(os.homedir(), '.ssh', 'id_ed25519')
const PUBLIC_KEY = `${KEY}.pub`

const TOPICS = ['password-manager', 'keepass', 'kdbx', 'electron', 'windows', 'local-first', 'privacy', 'typescript']
const DESCRIPTION = '钥匙窝 YaoShiWo：本地优先、不上传云端的 Windows 密码管理器，兼容 KeePass 2 的 .kdbx'
const HOMEPAGE = 'https://www.yaoshiwo.cn'

if (!TOKEN) {
  console.error('缺少环境变量 GITHUB_TOKEN（Personal Access Token，勾 repo + admin:public_key）')
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

// 注意：不要用 'pipe' 抓 git 的输出——某些沙箱环境会 EPERM，推送这种交互式命令用 inherit 最稳
const git = (args, opts = {}) =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', ...opts }).trim()
const gitInherit = (args) => execFileSync('git', args, { cwd: ROOT, stdio: 'inherit' })

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
    console.log(`   注意：令牌属于 ${login}，但目标仓库是 ${OWNER}/${NAME}`)
  }

  console.log(`2) 确认仓库 ${OWNER}/${NAME} …`)
  const exists = await api(`/repos/${OWNER}/${NAME}`)
  if (exists.status === 404) {
    const created = await api('/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: NAME,
        description: DESCRIPTION,
        homepage: HOMEPAGE,
        private: false,
        has_issues: true,
        has_wiki: false,
        has_projects: false,
        has_downloads: true,
        auto_init: false
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

  console.log('3) 确认 SSH 钥匙 …')
  if (!fs.existsSync(KEY)) {
    console.error(`   找不到私钥：${KEY}（用 SAFEVAULT_SSH_KEY 指定，或先 ssh-keygen -t ed25519）`)
    process.exit(1)
  }
  const pubLine = fs.readFileSync(PUBLIC_KEY, 'utf8').trim()
  const pubBody = pubLine.split(' ').slice(0, 2).join(' ')
  const keys = await api('/user/keys')
  const already = keys.status === 200 && keys.json.some((k) => `${k.key}`.startsWith(pubBody))
  if (already) {
    console.log('   已在本账号的 SSH 钥匙里，跳过')
  } else {
    const added = await api('/user/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'yaoshiwo-deploy', key: pubLine })
    })
    if (added.status === 201) {
      console.log('   已添加公钥到账号：' + added.json.title)
    } else {
      console.error(`   添加公钥失败（HTTP ${added.status}）：${added.text.slice(0, 200)}`)
      console.error('   令牌可能缺少 admin:public_key 权限。可手动到 https://github.com/settings/ssh/new 粘贴：')
      console.error('   ' + pubLine)
      process.exit(1)
    }
  }

  console.log('4) 确认本地仓库状态 …')
  try {
    git(['rev-parse', '--is-inside-work-tree'])
  } catch {
    console.error('   当前目录不是 git 仓库')
    process.exit(1)
  }
  const dirty = git(['status', '--porcelain', '--untracked-files=all'])
  if (dirty) {
    console.log('   工作区有未提交改动：')
    console.log(dirty.split('\n').slice(0, 10).map((l) => '     ' + l).join('\n'))
    console.error('   请先提交再推送（避免把半成品推上去）')
    process.exit(1)
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  console.log(`   分支：${branch}，提交：${git(['log', '--oneline', '-1'])}`)

  console.log('5) 推送（走 SSH）…')
  const sshCommand = `ssh -i "${KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new`
  git(['remote', 'remove', 'origin'], { stdio: 'ignore' }) // 可能没有，失败无所谓
  git(['remote', 'add', 'origin', `git@github.com:${OWNER}/${NAME}.git`])
  try {
    gitInherit(['push', '-u', 'origin', `${branch}:main`])
  } catch {
    console.error('   推送失败。若提示非快进（远端已有提交），确认这是新仓库后再加 --force 重试。')
    process.exit(1)
  }

  console.log('6) 设置描述与标签 …')
  const patched = await api(`/repos/${OWNER}/${NAME}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: DESCRIPTION, homepage: HOMEPAGE, has_wiki: false, has_projects: false })
  })
  if (patched.status === 200) console.log('   描述/主页已更新')
  const topics = await api(`/repos/${OWNER}/${NAME}/topics`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.github.mercy-preview+json' },
    body: JSON.stringify({ names: TOPICS })
  })
  if (topics.status === 200) console.log('   标签：' + topics.json.names.join(', '))

  console.log('\n完成：https://github.com/' + OWNER + '/' + NAME)
  console.log('\n最后一步（安装包不进仓库，走 Release 附件，需要手动上传）：')
  console.log('  1. 打开 https://github.com/' + OWNER + '/' + NAME + '/releases/new')
  console.log('  2. Tag 填 v1.2.1，标题填「钥匙窝 v1.2.1：改名 + 官网上线」')
  console.log('  3. 上传 release\\YaoShiWo-Setup-1.2.0.exe 与 release\\YaoShiWo-portable.exe')
  console.log('  4. 发布后 README 里的 Releases 链接自然生效')
})().catch((e) => {
  console.error('出错：', e.message)
  process.exit(1)
})
