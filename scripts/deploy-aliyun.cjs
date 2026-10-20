// 把 website/ 部署到阿里云服务器（Nginx 静态站）。
//
// 用法（密码只从环境变量读，绝不写进代码，方便开源）：
//   $env:SAFEVAULT_SSH_PASS='服务器root密码'
//   node scripts/deploy-aliyun.cjs recon     # 只看不动：系统版本、nginx 是否已装、磁盘、已有站点
//   node scripts/deploy-aliyun.cjs deploy    # 真正部署：上传文件 + 写 nginx 配置 + 重载
//   node scripts/deploy-aliyun.cjs status    # 部署后检查：nginx -t、站点响应、证书
//
// 可用环境变量覆盖默认值：
//   SAFEVAULT_SSH_HOST（必填：服务器公网 IP 或域名）、SAFEVAULT_SSH_USER（默认 root）
//   SAFEVAULT_SSH_PORT（默认 22）、SAFEVAULT_DOMAIN（默认 yaoshiwo.cn）
//   SAFEVAULT_WEB_ROOT（默认 /var/www/yaoshiwo）
const { Client } = require('ssh2')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const LOCAL_SITE = path.join(ROOT, 'website')
// 服务器地址只从环境变量读，不写死在代码里（这是要开源的仓库，别把你服务器的 IP 和密码写进去）
const HOST = process.env.SAFEVAULT_SSH_HOST || ''
const USER = process.env.SAFEVAULT_SSH_USER || 'root'
const PORT = Number(process.env.SAFEVAULT_SSH_PORT || 22)
const DOMAIN = process.env.SAFEVAULT_DOMAIN || 'yaoshiwo.cn'
const WEB_ROOT = process.env.SAFEVAULT_WEB_ROOT || '/var/www/yaoshiwo'
const PASS = process.env.SAFEVAULT_SSH_PASS
const mode = (process.argv[2] || 'recon').toLowerCase()

// 不上传的东西：本地预览截图（体积大且没必要上服务器）
const SKIP_DIRS = new Set(['preview'])
const SKIP_FILES = new Set(['.gitignore'])

if (!PASS) {
  console.error('缺少环境变量 SAFEVAULT_SSH_PASS（服务器 root 密码）。')
  process.exit(2)
}
if (!HOST) {
  console.error('缺少环境变量 SAFEVAULT_SSH_HOST（服务器公网 IP 或域名）。')
  process.exit(2)
}

function connect() {
  return new Promise((resolve, reject) => {
    const conn = new Client()
    conn.on('ready', () => resolve(conn))
    conn.on('error', (e) => reject(e))
    conn.connect({
      host: HOST,
      port: PORT,
      username: USER,
      password: PASS,
      readyTimeout: 25000,
      keepaliveInterval: 10000
    })
  })
}

function sh(conn, cmd, { timeout = 120000, label } = {}) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: false }, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      let errOut = ''
      const timer = setTimeout(() => {
        stream.close()
        reject(new Error('命令超时: ' + cmd))
      }, timeout)
      stream.on('data', (d) => (out += d.toString()))
      stream.stderr.on('data', (d) => (errOut += d.toString()))
      stream.on('close', (code) => {
        clearTimeout(timer)
        if (label) console.log(`  $ ${label} → exit ${code}`)
        resolve({ code, out, err: errOut })
      })
    })
  })
}

function sftpOf(conn) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)))
  })
}

function walk(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    const rel = path.relative(base, full).split(path.sep).join('/')
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      walk(full, base, acc)
    } else if (!SKIP_FILES.has(e.name)) {
      acc.push({ rel, full, size: fs.statSync(full).size })
    }
  }
  return acc
}

function mkdirp(sftp, dir) {
  return new Promise((resolve) => sftp.mkdir(dir, { mode: 0o755 }, () => resolve()))
}

function put(sftp, local, remote) {
  return new Promise((resolve, reject) => {
    sftp.fastPut(local, remote, (err) => (err ? reject(err) : resolve()))
  })
}

async function uploadDir(conn, localDir, remoteDir) {
  const sftp = await sftpOf(conn)
  const files = walk(localDir)
  const dirs = new Set()
  for (const f of files) {
    const parts = f.rel.split('/')
    parts.pop()
    let acc = ''
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p
      dirs.add(acc)
    }
  }
  await mkdirp(sftp, remoteDir)
  for (const d of [...dirs].sort()) await mkdirp(sftp, `${remoteDir}/${d}`)

  let done = 0
  let bytes = 0
  for (const f of files) {
    await put(sftp, f.full, `${remoteDir}/${f.rel}`)
    done++
    bytes += f.size
    if (done % 20 === 0 || f.size > 5 * 1024 * 1024) {
      console.log(`  已上传 ${done}/${files.length}（${(bytes / 1048576).toFixed(1)} MB）→ ${f.rel}`)
    }
  }
  sftp.end()
  console.log(`  上传完成：${done} 个文件，共 ${(bytes / 1048576).toFixed(1)} MB`)
  return { files: done, bytes }
}

// 安全响应头。nginx 的 add_header 是「上一层有写就不再继承上一层」，所以每个自己写了
// add_header 的 location 都必须把这组头再写一遍，否则 /assets/ /download/ 会静默丢掉 CSP 与 HSTS。
// HSTS 只在 HTTPS 下有意义，经明文收到时浏览器按 RFC 6797 会忽略，所以两版共用一份没问题。
const SECURITY_HEADERS = `    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    # 官网用不到摄像头/麦克风/定位/支付，直接禁掉，减少被第三方脚本滥用的面
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()" always;
    # 让浏览器记住「这个域名只走 HTTPS」，有效期半年。
    # 刻意不加 includeSubDomains：以后若再加只走 HTTP 的子域名，不至于被一起锁死。
    add_header Strict-Transport-Security "max-age=15552000" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'" always;
`

// 站点公共部分（location / 缓存 / 安全头 / gzip），HTTP 与 HTTPS 两个版本共用
const NGINX_COMMON = `
    root ${WEB_ROOT};
    index index.html;

    charset utf-8;
    access_log /var/log/nginx/${DOMAIN}.access.log;
    error_log  /var/log/nginx/${DOMAIN}.error.log;

    # 安全响应头（meta 里放 frame-ancestors 无效，只能在这里给）
${SECURITY_HEADERS}
    location = /index.html {
${SECURITY_HEADERS}        add_header Cache-Control "no-cache";
    }

    # 静态资源长缓存
    location /assets/ {
${SECURITY_HEADERS}        expires 30d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }

    # 安装包 / 扩展压缩包：必须走下载而不是在浏览器里打开
    location /download/ {
${SECURITY_HEADERS}        types { }
        default_type application/octet-stream;
        add_header Content-Disposition "attachment";
        try_files $uri =404;
    }

    # 网站地图与爬虫文件
    location = /sitemap.xml { default_type application/xml; charset utf-8; }
    location = /robots.txt  { default_type text/plain; charset utf-8; }

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;
`

// 配置整份由本脚本生成，不再让 certbot 改这个文件：
// certbot 改过的文件下次部署被覆盖 → HTTPS 静默失效；certbot 还会把 80 端口上的
// 根域名写成 return 404（只给 www 放行跳转）。生成权归脚本，certbot 只负责发证书。
function buildNginxConf(certDir) {
  if (!certDir) {
    return `# 钥匙窝 YaoShiWo 官网 —— 由 scripts/deploy-aliyun.cjs 生成（HTTP 版，证书尚未签发）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
${NGINX_COMMON}
    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
    }
}
`
  }
  return `# 钥匙窝 YaoShiWo 官网 —— 由 scripts/deploy-aliyun.cjs 生成（HTTPS 版，证书 ${certDir}）
# 80 端口：两个域名一律 301 到 https（保留路径与查询串）
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # 续期 / 扩签证书的验证文件必须能直接从 80 取到：
    # 如果这里也 301 到 https，在证书还没覆盖根域名时 ACME 校验会跟着跳转然后失败。
    location /.well-known/acme-challenge/ {
        root ${WEB_ROOT};
        default_type text/plain;
    }

    location / {
        return 301 https://www.${DOMAIN}$request_uri;
    }
}

# 443 端口：真正提供服务
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN} www.${DOMAIN};

    # 根域名统一跳到 www：canonical / sitemap / 公众号里写的都是 www，同一份内容不留两个地址
    if ($host = ${DOMAIN}) {
        return 301 https://www.${DOMAIN}$request_uri;
    }

${NGINX_COMMON}
    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html {
        internal;
    }

    ssl_certificate     ${certDir}/fullchain.pem;
    ssl_certificate_key ${certDir}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
}
`
}


async function recon(conn) {
  console.log('===== 服务器侦察（不做任何修改）=====')
  const cmds = [
    ['系统版本', 'cat /etc/os-release 2>/dev/null | head -3'],
    ['内核/架构', 'uname -m && uname -r'],
    ['CPU/内存', 'nproc && free -m | head -2'],
    ['磁盘', 'df -h / | tail -1'],
    ['nginx 是否已装', 'nginx -v 2>&1 || echo "未安装 nginx"'],
    ['nginx 版本详情', '(nginx -V 2>&1 | tr " " "\\n" | grep -E "with-http_ssl|with-http_v2" ) || true'],
    ['nginx 运行状态', 'systemctl is-active nginx 2>/dev/null || echo "未运行"'],
    ['已启用的站点', 'ls -1 /etc/nginx/conf.d/ 2>/dev/null; ls -1 /etc/nginx/sites-enabled/ 2>/dev/null'],
    ['现有网站目录', 'ls -1 /var/www/ 2>/dev/null || echo "(无 /var/www)"'],
    ['80/443 端口占用', 'ss -lntp 2>/dev/null | grep -E ":80|:443" || echo "80/443 未被占用"'],
    ['已有证书', 'ls -1 /etc/letsencrypt/live/ 2>/dev/null || echo "(无 certbot 证书)"'],
    ['certbot 是否已装', 'which certbot || echo "未安装 certbot"'],
    ['DNS 解析（服务器自己看）', `getent hosts ${DOMAIN} || echo "服务器上解析不到 ${DOMAIN}（正常，等 DNS 生效）"`],
    ['宝塔面板', 'ls -d /www/server/panel 2>/dev/null || echo "无宝塔"'],
    ['nginx 进程', 'ps -eo pid,ppid,user,etime,args | grep -E "[n]ginx" | head -8'],
    ['nginx 由谁管理', 'systemctl list-units --all 2>/dev/null | grep -i nginx || echo "systemd 里没有 nginx 单元"'],
    ['nginx 主配置里的 include', 'grep -E "^\\s*include" /etc/nginx/nginx.conf'],
    ['现有站点配置内容', 'for f in /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/*; do [ -f "$f" ] && echo "===== $f =====" && cat "$f"; done 2>/dev/null | head -80'],
    ['现有网站文件', 'ls -la /var/www/ 2>/dev/null; echo "--- html ---"; ls -la /var/www/html 2>/dev/null | head -10; echo "--- portal ---"; ls -la /var/www/portal 2>/dev/null | head -10'],
    ['80 端口实际响应', 'curl -s -o /dev/null -w "本机直接访问 80 → HTTP %{http_code}｜server=%{header_json}" http://127.0.0.1/ 2>/dev/null | head -c 200 || echo 失败'],
    ['当前时间与时区', 'date && timedatectl 2>/dev/null | head -3'],
    ['是否在容器里', 'systemd-detect-virt 2>/dev/null || echo unknown']
  ]
  for (const [label, cmd] of cmds) {
    const r = await sh(conn, cmd)
    const text = (r.out || r.err || '').trim()
    console.log(`\n— ${label} —\n${text || '(空)'}`)
  }
}

async function deploy(conn) {
  console.log('===== 部署开始 =====')
  const os = (await sh(conn, 'cat /etc/os-release | head -2')).out
  console.log('目标服务器：' + os.trim().replace(/\n/g, ' | '))

  const hasNginx = (await sh(conn, 'command -v nginx || true')).out.trim()
  if (!hasNginx) {
    console.log('服务器没有 nginx，开始安装…')
    const inst = await sh(
      conn,
      'export DEBIAN_FRONTEND=noninteractive; (apt-get update -y && apt-get install -y nginx) || (yum install -y nginx)',
      { timeout: 600000 }
    )
    console.log(inst.out.split('\n').slice(-6).join('\n'))
    const again = (await sh(conn, 'command -v nginx || true')).out.trim()
    if (!again) throw new Error('nginx 安装失败，请手动安装后再部署')
  } else {
    console.log('nginx 已安装：' + (await sh(conn, 'nginx -v 2>&1')).out.trim())
  }

  console.log('\n创建网站目录 ' + WEB_ROOT)
  await sh(conn, `mkdir -p ${WEB_ROOT}`)

  console.log('\n上传网站文件…')
  const { files, bytes } = await uploadDir(conn, LOCAL_SITE, WEB_ROOT)
  console.log(`  共 ${files} 个文件 / ${(bytes / 1048576).toFixed(1)} MB`)

  // 机器上已有证书（之前跑过 https 子命令）→ 直接生成带 443 与跳转的版本，一步到位
  const liveCerts = (await sh(conn, 'ls -1 /etc/letsencrypt/live/ 2>/dev/null || true')).out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const certName = [`www.${DOMAIN}`, DOMAIN].find((d) => liveCerts.includes(d)) || null
  const certDir = certName ? `/etc/letsencrypt/live/${certName}` : null

  console.log('\n写入 nginx 配置 /etc/nginx/conf.d/' + DOMAIN + '.conf')
  if (certDir) {
    console.log(`  检测到证书 ${certName}，生成 HTTPS 版配置（80 → 443 跳转 + 443 服务）`)
  } else {
    console.log('  还没有证书，生成 HTTP 版配置（先跑 https 子命令能变成 HTTPS 版）')
  }
  const sftp = await sftpOf(conn)
  const tmp = `/tmp/${DOMAIN}.conf`
  await new Promise((resolve, reject) =>
    sftp.writeFile(tmp, buildNginxConf(certDir), 'utf8', (e) => (e ? reject(e) : resolve()))
  )
  sftp.end()
  // 先备份上一版，出问题能回滚
  await sh(conn, `test -f /etc/nginx/conf.d/${DOMAIN}.conf && cp /etc/nginx/conf.d/${DOMAIN}.conf /etc/nginx/conf.d/${DOMAIN}.conf.bak || true`)
  await sh(conn, `mv ${tmp} /etc/nginx/conf.d/${DOMAIN}.conf && chmod 644 /etc/nginx/conf.d/${DOMAIN}.conf`)
  // 刻意不动服务器上已有的其它站点配置（这台机器上原本就有别人的站点，删了会搞坏别人的站）：
  // 我们的 server_name 只认 yaoshiwo.cn，不会和其它站点抢域名。

  const test = await sh(conn, 'nginx -t 2>&1')
  console.log(test.out.trim())
  if (test.code !== 0) throw new Error('nginx 配置检查未通过，已放弃重载（配置留在 /etc/nginx/conf.d/' + DOMAIN + '.conf）')

  // 这台服务器上的 nginx 不是 systemd 管的（systemctl is-active 显示未运行，但进程确实在监听 80），
  // 所以优先用 nginx 自己的信号重载，失败再退回 systemctl。
  const reload = await sh(conn, 'nginx -s reload 2>&1 || systemctl reload nginx 2>&1 || systemctl restart nginx 2>&1')
  console.log('重载结果：' + (reload.out.trim() || 'ok'))

  await sh(conn, `chown -R www-data:www-data ${WEB_ROOT} 2>/dev/null || chown -R nginx:nginx ${WEB_ROOT} 2>/dev/null; chmod -R a+rX ${WEB_ROOT}`)
  console.log('目录权限已设置')

  console.log('\n—— 部署后自检 ——')
  for (const [label, cmd] of [
    ['nginx 状态', 'systemctl is-active nginx'],
    ['本机访问首页', 'curl -skL -o /dev/null -w "%{http_code}" -H "Host: ' + DOMAIN + '" https://127.0.0.1/'],
    ['本机访问安装包', `f=$(ls -1 ${WEB_ROOT}/download/YaoShiWo-Setup-*.exe 2>/dev/null | sort -V | tail -1); echo -n "$(basename "$f") "; curl -skIL -o /dev/null -w "%{http_code} %{content_type} %{size_download}" -H "Host: ${DOMAIN}" "https://127.0.0.1/download/$(basename "$f")"`],
    ['本机访问 sitemap', 'curl -skL -o /dev/null -w "%{http_code} %{content_type}" -H "Host: ' + DOMAIN + '" https://127.0.0.1/sitemap.xml'],
    ['站点文件数', `find ${WEB_ROOT} -type f | wc -l`],
    ['占用空间', `du -sh ${WEB_ROOT}`],
    ['防火墙', '(ufw status 2>/dev/null | head -1) || (firewall-cmd --state 2>/dev/null) || echo "无 ufw/firewalld"']
  ]) {
    const r = await sh(conn, cmd)
    console.log(`  ${label}：${(r.out || r.err).trim()}`)
  }
  console.log('\n===== 部署完成 =====')
  console.log('日常：改了网站文件就重跑 node scripts/deploy-aliyun.cjs deploy；只改 nginx 模板用 conf。')
  console.log('证书：' + DOMAIN + ' 与 www.' + DOMAIN + ' 共用一张证书，certbot 定时任务自动续期（certbot renew --dry-run 可演练）。')
}

async function netcheck(conn) {
  console.log('===== 排查「外面为什么访问不到」=====')
  for (const [label, cmd] of [
    ['本机 IP', 'hostname -I; echo "---"; ip -4 addr show | grep -E "inet " | head -5'],
    ['本机自测 127.0.0.1:80', 'curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 6 http://127.0.0.1/'],
    ['本机自测公网 IP:80', `curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 6 http://${HOST}/ || echo "（本机绕公网 IP 也不通）"`],
    ['本机自测域名:80', `curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 6 -H "Host: ${DOMAIN}" http://127.0.0.1/`],
    ['iptables 规则', 'iptables -S 2>/dev/null | head -25 || echo "（无 iptables 或无权限）"'],
    ['iptables 统计（有没有被丢包）', 'iptables -L INPUT -v -n 2>/dev/null | head -8 || echo "（读不到）"'],
    ['nftables', 'nft list ruleset 2>/dev/null | head -20 || echo "（没有 nft 规则）"'],
    ['ufw', 'ufw status 2>/dev/null || echo "（无 ufw）"'],
    ['firewalld', 'firewall-cmd --state 2>/dev/null || echo "（无 firewalld）"'],
    ['云盾/安全插件', 'ps -eo args | grep -Ei "[a]liyun|[a]egis|[c]loudmonitor" | head -5 || echo "（没看到阿里云安全插件）"'],
    ['监听情况', 'ss -lntp | grep -E ":80|:443" || echo "80/443 没在监听"']
  ]) {
    const r = await sh(conn, cmd)
    console.log(`\n— ${label} —\n${(r.out || r.err).trim() || '(空)'}`)
  }
  console.log('\n结论怎么看：')
  console.log('  · 本机自测公网 IP 通、外面不通 → 阿里云安全组没放行（去控制台加入方向 80/443）')
  console.log('  · 本机自测公网 IP 也不通 → 公网 IP 是 NAT 映射，重点看安全组')
  console.log('  · iptables 里有 DROP/REJECT 且计数在涨 → 是本机防火墙，可以自己修')
}

async function https(conn) {
  console.log('===== 配置 HTTPS（Let\'s Encrypt）=====')
  const resolved = (await sh(conn, `getent hosts ${DOMAIN} || true`)).out.trim()
  console.log(`${DOMAIN} 在本机解析：${resolved || '（解析不到）'}`)
  if (!resolved) {
    console.log('\n域名还没解析到这台服务器，证书签不下来（Let\'s Encrypt 要从公网访问验证）。')
    console.log('请先在域名服务商处加 A 记录：')
    console.log(`   ${DOMAIN}      → ${HOST}`)
    console.log(`   www.${DOMAIN}  → ${HOST}`)
    console.log('等 DNS 生效（一般几分钟到几小时）后再跑一次：node scripts/deploy-aliyun.cjs https')
    return
  }

  const has = (await sh(conn, 'command -v certbot || true')).out.trim()
  if (!has) {
    console.log('安装 certbot …')
    const inst = await sh(
      conn,
      'export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq certbot python3-certbot-nginx',
      { timeout: 900000 }
    )
    console.log(inst.out.split('\n').slice(-5).join('\n'))
  }
  const nowHas = (await sh(conn, 'command -v certbot || true')).out.trim()
  if (!nowHas) throw new Error('certbot 安装失败')

  const email = process.env.SAFEVAULT_ACME_EMAIL
  const mailArg = email ? `-m ${email}` : '--register-unsafely-without-email'
  // 用 certonly --webroot：certbot 只负责发证书，nginx 配置由本脚本生成。
  // 好处是根域名和 www 都能一次签进同一张证书（certbot --nginx 会改我们的配置文件，
  // 而且会把 80 上的根域名写成 return 404），也不会和下次部署打架。
  console.log('申请证书（webroot 方式，不改 nginx 配置）…')
  const r = await sh(
    conn,
    `certbot certonly --webroot -w ${WEB_ROOT} -d ${DOMAIN} -d www.${DOMAIN} --expand --non-interactive --agree-tos ${mailArg} 2>&1 | tail -25`,
    { timeout: 300000 }
  )
  console.log(r.out.trim())

  // 拿到证书后由脚本自己写 HTTPS 配置（80 全部跳转 + 443 提供服务，两个域名都算数）
  const liveCerts2 = (await sh(conn, 'ls -1 /etc/letsencrypt/live/ 2>/dev/null || true')).out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const certName2 = [`www.${DOMAIN}`, DOMAIN].find((d) => liveCerts2.includes(d))
  if (!certName2) throw new Error(`证书没有签下来（/etc/letsencrypt/live 里没有 ${DOMAIN} 或 www.${DOMAIN}）`)
  const certDir2 = `/etc/letsencrypt/live/${certName2}`

  console.log(`\n写入 HTTPS 版 nginx 配置（证书 ${certName2}）…`)
  const sftp2 = await sftpOf(conn)
  const tmp2 = `/tmp/${DOMAIN}.conf`
  await new Promise((resolve, reject) =>
    sftp2.writeFile(tmp2, buildNginxConf(certDir2), 'utf8', (e) => (e ? reject(e) : resolve()))
  )
  sftp2.end()
  await sh(conn, `test -f /etc/nginx/conf.d/${DOMAIN}.conf && cp /etc/nginx/conf.d/${DOMAIN}.conf /etc/nginx/conf.d/${DOMAIN}.conf.bak || true`)
  await sh(conn, `mv ${tmp2} /etc/nginx/conf.d/${DOMAIN}.conf && chmod 644 /etc/nginx/conf.d/${DOMAIN}.conf`)
  const t2 = await sh(conn, 'nginx -t 2>&1')
  console.log(t2.out.trim())
  if (t2.code !== 0) throw new Error('nginx 配置检查未通过（旧配置在 ' + DOMAIN + '.conf.bak）')
  const rl2 = await sh(conn, 'nginx -s reload 2>&1 || systemctl reload nginx 2>&1')
  console.log('重载结果：' + (rl2.out.trim() || 'ok'))

  console.log('\n—— 复核 ——')
  for (const [label, cmd] of [
    ['证书文件', `ls -1 ${certDir2}/ | tr '\\n' ' '`],
    ['证书覆盖的域名', `openssl x509 -in ${certDir2}/fullchain.pem -noout -text 2>/dev/null | grep -A1 "Subject Alternative Name" | tail -1`],
    ['证书有效期', `openssl x509 -enddate -noout -in ${certDir2}/fullchain.pem 2>/dev/null || true`],
    ['自动续期定时任务', 'systemctl list-timers 2>/dev/null | grep -i certbot || ls -l /etc/cron.d/certbot* 2>/dev/null || echo "（检查 certbot renew 是否已配）"'],
    ['本机 https（www）', `curl -sk -o /dev/null -w "HTTP %{http_code}" --max-time 8 https://127.0.0.1/ -H "Host: www.${DOMAIN}"`],
    ['本机 https（根域名）', `curl -sk -o /dev/null -w "HTTP %{http_code}" --max-time 8 https://127.0.0.1/ -H "Host: ${DOMAIN}"`],
    ['本机 http（www 跳转）', `curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-time 8 -H "Host: www.${DOMAIN}" http://127.0.0.1/`],
    ['本机 http（根域名跳转）', `curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-time 8 -H "Host: ${DOMAIN}" http://127.0.0.1/`]
  ]) {
    const rr = await sh(conn, cmd)
    console.log(`  ${label}：${(rr.out || rr.err).trim()}`)
  }
  console.log('\n提示：证书 90 天自动续期由 certbot 的定时任务负责；这台机器 systemd 不太正常，')
  console.log('      建议顺手加一条 crontab：0 3 * * * certbot renew --quiet --post-hook "nginx -s reload"')
}

async function status(conn) {
  console.log('===== 线上状态检查 =====')
  for (const [label, cmd] of [
    ['nginx 配置', 'nginx -t 2>&1'],
    ['nginx 状态', 'systemctl is-active nginx'],
    ['监听端口', 'ss -lntp | grep -E ":80|:443" || echo "无"'],
    ['站点文件数/大小', `du -sh ${WEB_ROOT} 2>/dev/null; find ${WEB_ROOT} -type f 2>/dev/null | wc -l`],
    ['首页', `curl -s -o /dev/null -w "HTTP %{http_code}｜%{size_download} 字节｜%{time_total}s" -H "Host: ${DOMAIN}" http://127.0.0.1/`],
    ['CSS', `curl -s -o /dev/null -w "HTTP %{http_code}｜%{content_type}" -H "Host: ${DOMAIN}" http://127.0.0.1/assets/css/style.css`],
    ['robots', `curl -s -o /dev/null -w "HTTP %{http_code}｜%{content_type}" -H "Host: ${DOMAIN}" http://127.0.0.1/robots.txt`],
    ['证书', `ls -1 /etc/letsencrypt/live/ 2>/dev/null || echo "还没有证书"`],
    ['公网访问（从服务器出去绕回）', `curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 8 http://${DOMAIN}/ || echo "解析或备案未就绪"`]
  ]) {
    const r = await sh(conn, cmd)
    console.log(`  ${label}：${(r.out || r.err).trim()}`)
  }
}

// 只重写 nginx 配置（不上传网站文件）：改了 nginx 模板或刚签完证书时用
async function conf(conn) {
  console.log('===== 重写 nginx 配置（不动网站文件）=====')
  const liveCerts = (await sh(conn, 'ls -1 /etc/letsencrypt/live/ 2>/dev/null || true')).out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const certName = [`www.${DOMAIN}`, DOMAIN].find((d) => liveCerts.includes(d)) || null
  const certDir = certName ? `/etc/letsencrypt/live/${certName}` : null
  console.log(certDir ? `检测到证书 ${certName} → 生成 HTTPS 版配置` : '没有证书 → 生成 HTTP 版配置')

  const sftp = await sftpOf(conn)
  const tmp = `/tmp/${DOMAIN}.conf`
  await new Promise((resolve, reject) =>
    sftp.writeFile(tmp, buildNginxConf(certDir), 'utf8', (e) => (e ? reject(e) : resolve()))
  )
  sftp.end()
  await sh(conn, `test -f /etc/nginx/conf.d/${DOMAIN}.conf && cp /etc/nginx/conf.d/${DOMAIN}.conf /etc/nginx/conf.d/${DOMAIN}.conf.bak || true`)
  await sh(conn, `mv ${tmp} /etc/nginx/conf.d/${DOMAIN}.conf && chmod 644 /etc/nginx/conf.d/${DOMAIN}.conf`)

  const t = await sh(conn, 'nginx -t 2>&1')
  console.log(t.out.trim())
  if (t.code !== 0) throw new Error(`nginx 配置检查未通过（旧配置已备份为 ${DOMAIN}.conf.bak）`)
  const r = await sh(conn, 'nginx -s reload 2>&1 || systemctl reload nginx 2>&1')
  console.log('重载：' + (r.out.trim() || 'ok'))

  console.log('\n—— 生效检查 ——')
  for (const [label, cmd] of [
    ['www http', `curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-time 6 -H "Host: www.${DOMAIN}" http://127.0.0.1/`],
    ['根域名 http', `curl -s -o /dev/null -w "HTTP %{http_code} → %{redirect_url}" --max-time 6 -H "Host: ${DOMAIN}" http://127.0.0.1/`],
    ['www https', `curl -sk -o /dev/null -w "HTTP %{http_code}｜%{size_download} 字节" --max-time 6 -H "Host: www.${DOMAIN}" https://127.0.0.1/`],
    ['根域名 https', `curl -sk -o /dev/null -w "HTTP %{http_code}｜%{size_download} 字节" --max-time 6 -H "Host: ${DOMAIN}" https://127.0.0.1/`],
    ['acme 验证通道（80）', `curl -s -o /dev/null -w "HTTP %{http_code}" --max-time 6 -H "Host: www.${DOMAIN}" http://127.0.0.1/.well-known/acme-challenge/preflight.txt`]
  ]) {
    const rr = await sh(conn, cmd)
    console.log(`  ${label}：${(rr.out || rr.err).trim()}`)
  }
}

;(async () => {
  let conn
  try {
    console.log(`连接 ${USER}@${HOST}:${PORT} …`)
    conn = await connect()
    console.log('已登录服务器\n')
    if (mode === 'recon') await recon(conn)
    else if (mode === 'deploy') await deploy(conn)
    else if (mode === 'conf') await conf(conn)
    else if (mode === 'netcheck') await netcheck(conn)
    else if (mode === 'https') await https(conn)
    else if (mode === 'status') await status(conn)
    else {
      console.error('未知模式：' + mode + '（可用：recon / deploy / conf / netcheck / https / status）')
      process.exitCode = 2
    }
  } catch (e) {
    console.error('\n!! 失败：' + e.message)
    process.exitCode = 1
  } finally {
    if (conn) conn.end()
  }
})()
