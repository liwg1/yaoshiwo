# 钥匙窝 官网上线手册（阿里云 + GitHub + 搜索引擎收录）

页面本身已经做好了 SEO 基础：关键词化的标题与描述、Open Graph 分享卡片、结构化数据（SoftwareApplication + FAQPage）、`robots.txt`、`sitemap.xml`、移动端适配、单页 8 个语义化区块、无外部 CDN 依赖。

---

## 一、域名（当前已配置：`yaoshiwo.cn`）

全站域名已经替换完毕：`index.html` 的 `canonical` / `og:url` / `og:image` / `twitter:image` / 结构化数据（`url`、`downloadUrl`、`installUrl`、`softwareHelp`、`image`、`screenshot`、`logo.url`）、`sitemap.xml` 的 `<loc>` 与 `<image:loc>`、`robots.txt` 的 `Sitemap:` 行，全部指向 `https://yaoshiwo.cn`。`node scripts/audit-site.cjs` 现在输出 ✅。

**以后如果要换域名**（比如再加一个 `.com`），把下面这条命令里的域名换掉再跑一次，然后确认：

```powershell
cd E:\Code\harness\safevault
# 1. 全局替换（含注释）：把旧域名换成新域名
node -e "const fs=require('fs');const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);for(const f of walk('website')){if(!/\.(html|xml|txt|md)$/.test(f))continue;let s=fs.readFileSync(f,'utf8');const n=(s.split('旧域名.com').length-1);if(!n)continue;s=s.split('旧域名.com').join('新域名.com');fs.writeFileSync(f,s,'utf8');console.log(f+' 替换 '+n+' 处')}"
# 2. 检查是否还有漏网的占位域名或旧域名
node scripts/audit-site.cjs
```

> `audit-site.cjs` 会把没替换的占位域名直接标成问题，替换干净才会输出 ✅。

---

## 二、一键部署到阿里云（推荐做法）

在项目根目录执行，脚本会自动上传文件、写 nginx 配置、检查语法、重载、并做部署后自检：

> 前置：先跑一次 `npm install` —— 部署脚本用到的 `ssh2` 放在 devDependencies 里（不随打包产物发布）。
> 注意不要用 `npm install <包> --no-save` 临时装包：它会顺手把 `ssh2` 这类未声明的包清掉，导致脚本报 `Cannot find module 'ssh2'`。

```powershell
cd E:\Code\harness\safevault
$env:SAFEVAULT_SSH_HOST='你的服务器公网IP'      # 必填
$env:SAFEVAULT_SSH_PASS='服务器 root 密码'      # 必填（只从环境变量读，绝不写进仓库）
# 可选：$env:SAFEVAULT_DOMAIN / $env:SAFEVAULT_WEB_ROOT / $env:SAFEVAULT_SSH_USER / $env:SAFEVAULT_SSH_PORT

node scripts/deploy-aliyun.cjs recon      # 只看不动：系统、nginx、磁盘、已有站点、端口占用
node scripts/deploy-aliyun.cjs deploy     # 正式部署（上传 + 写配置 + 重载 + 自检）
node scripts/deploy-aliyun.cjs netcheck   # 外面访问不到时，判断是安全组还是本机防火墙
node scripts/deploy-aliyun.cjs status     # 日常检查线上状态
node scripts/deploy-aliyun.cjs https      # 域名解析生效后，一键申请 HTTPS 证书并自动跳转

node scripts/verify-deploy.cjs            # 用 sha256 逐字节比对「线上文件 vs 本地文件」
```

`verify-deploy.cjs` 这一步别省：只看到「HTTP 200」不算数——万一是旧文件或上传中断，页面照样返回 200。哈希比对才能确认线上跑的就是你本地这一份。

**首次上线的三件配套设置（缺一不可）：**

| 事项 | 在哪里做 | 说明 |
| --- | --- | --- |
| 放行 80 / 443 | 阿里云控制台 → ECS → 安全组 → 入方向 | 不加这条，外面访问会**超时**（不是拒绝，是数据包被丢弃）。用 `netcheck` 可以确认是不是这个原因 |
| 域名解析 | 域名服务商 → DNS 解析 | 加 A 记录：`yaoshiwo.cn` 与 `www.yaoshiwo.cn` → 服务器公网 IP |
| ICP 备案 | 阿里云控制台 → 备案 | **大陆服务器未备案的域名会被拦截**，这一步没完成前，域名指向大陆服务器无法正常对外提供服务；备案期间 IP 直连也不稳定，建议先备案再发文章宣传 |

> 顺带提醒：服务器的 `systemd` 可能不可用（`systemctl is-active nginx` 报 bus 错误），此时 `nginx -s reload` 仍然有效——脚本已经优先用后者。另外这台机器上如果已经有别的站点（比如跑在 8080 的另一个站），本脚本**不会**动它的配置，新站只按 `server_name` 匹配自己的域名。

---

## 三、手动上传（不想用脚本时）

1. 上传：用 WinSCP / 宝塔 / scp 把整个 `website/` 目录传到服务器（`preview/` 可以不上传，它是自检截图）。
2. Nginx 站点配置（`/etc/nginx/conf.d/yaoshiwo.conf`）：

```nginx
server {
    listen 80;
    server_name 你的域名.com www.你的域名.com;
    root /var/www/yaoshiwo;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 安装包：强制下载、不要被浏览器当文本打开
    location ~* \.exe$ {
        default_type application/octet-stream;
        add_header Content-Disposition "attachment";
        add_header Cache-Control "public, max-age=604800";
    }

    # 静态资源缓存
    location ~* \.(css|js|svg|png|jpg|webp|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    gzip on;
    gzip_types text/css application/javascript image/svg+xml application/json;
    gzip_min_length 1024;

    # 防嵌套（CSP 里的 frame-ancestors 只能通过响应头生效）
    add_header Content-Security-Policy "frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

3. 刷新配置：`nginx -t && systemctl reload nginx`
4. **HTTPS 必须配**：下载可执行文件的站点没有 HTTPS，浏览器会提示「不安全」，收录与信任度都会受影响。阿里云可以申请免费证书（或 `certbot --nginx` 一条命令）。
5. **ICP 备案**：域名指向国内服务器必须完成备案，否则 80/443 会被拦，百度也不会正常收录。只有 IP 可以临时预览。

---

## 四、上传到 GitHub

仓库已经在本地准备好（`git log` 能看到提交），推上去只需要一个 **Personal Access Token**（GitHub 从 2021 年起关闭了密码认证，用账号密码推送一定失败）：

1. GitHub → 头像 → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → Generate new token，勾选 **`repo`**
2. 然后一条命令搞定（自动建仓库 + 推送 + 打印发 Release 的步骤）：

```powershell
cd E:\Code\harness\safevault
$env:GITHUB_TOKEN='ghp_你的令牌'
node scripts/push-github.cjs              # 默认推到 liwg1/yaoshiwo
node scripts/push-github.cjs liwg1/别的名字  # 想换仓库名
```

> 令牌只从环境变量读，脚本**不会**把它写进 `.git/config`（推完会把 origin 重置成不含令牌的干净地址）。
> 仓库里**不包含**密码库、备份、`node_modules`、安装包——见根目录 `.gitignore`。
> 安装包（各 80MB）走 **Releases** 附件，不要提交进仓库。

两种玩法，建议都做：

### A. 官网单独一个仓库 + GitHub Pages

```powershell
cd E:\Code\harness\safevault\website
git init
git add .
git commit -m "钥匙窝 官网"
git branch -M main
git remote add origin https://github.com/你的用户名/yaoshiwo-website.git
git push -u origin main
```

然后在仓库 `Settings → Pages` 里：`Source` 选 `Deploy from a branch`，分支选 `main`、目录选 `/ (root)`，保存后得到
`https://你的用户名.github.io/yaoshiwo-website/`。

- 仓库里的 `.gitignore` 已经把 `preview/` 和 `download/*.exe` 排除掉了——安装包每个 80MB，不适合进 Git 仓库。
- 想让 GitHub Pages 也用自定义域名：在 Pages 设置里填域名，然后到域名 DNS 加一条 `CNAME` 记录指向 `你的用户名.github.io`。
- ⚠️ 注意：GitHub Pages 在国内访问不稳定、百度抓取效果也差。**把阿里云当主站，GitHub 当镜像/开源展示**，两边内容保持一致即可。

### B. 整个 钥匙窝 项目开源（换取外链与信任度）

把 `safevault/` 项目源码推上去（记得 `.gitignore` 掉 `node_modules/`、`release/`、`out/`、`.backup/`），用 `Releases` 上传两个 `.exe` 作为附件，README 里放官网链接。GitHub 仓库主页是很好的外链来源，也方便别人给你提 issue。

---

## 五、让百度 / 必应优先展示你的官网

新站想在「密码管理器」这个大词上排第一不现实（前面是 KeePass、Bitwarden、1Password 和一堆软件下载站），但**收录**和**长尾词排名**是完全能做的，步骤如下。

### 1. 百度搜索资源平台（ziyuan.baidu.com）

1. 用百度账号登录 → 「用户中心 → 站点管理 → 添加站点」，填 `https://你的域名`。
2. 验证归属：选「HTML 文件验证」（把下载到的 `baidu_verify_xxxx.html` 放到网站根目录）或「HTML 标签验证」（把给的 `<meta name="baidu-site-verification" content="...">` 加到 `index.html` 的 `<head>` 里）。**两者都需要域名已备案且能正常访问。**
3. 进「普通收录 → sitemap」，提交 `https://你的域名/sitemap.xml`。
4. 再用「普通收录 → 手动提交」把首页 URL 提交一次，加速首次抓取。
5. 收录通常几天到几周开始，之后可以在「索引量」里看到条目。

### 2. 必应站长工具（bing.com/webmasters）

1. 添加站点，选「Meta 标签验证」或上传 `BingSiteAuth.xml`。
2. 提交 sitemap；Bing 收录比百度快，通常 1～3 天。
3. 顺便可以在「URL 提交」里手工提交首页。

### 3. Google Search Console（可选，但对 GitHub Pages 友好）

添加资源 → 验证 → 提交 sitemap。Google 对 GitHub Pages 的抓取很友好。

### 4. 真正能提升排名的动作（按性价比排序）

1. **备案 + 国内服务器 + HTTPS**：百度对备案站点明显更友好，这是国内 SEO 的地基。
2. **做长尾词**：围绕「本地密码管理器」「不上传云端的密码管理器」「免费 Windows 密码管理器」「KeePass 中文替代」「kdbx 编辑器」这类词写内容，竞争小、转化高，比死磕「密码管理器」有效得多。
3. **加内容页**：把「使用教程」「更新日志」「常见问题」拆成独立页面（`tutorial.html`、`changelog.html`、`faq.html`），每页有自己的 title/description，并在 `sitemap.xml` 里登记。搜索引擎喜欢持续更新的站点。
4. **拿外链**：
   - GitHub 仓库主页 README 里放官网链接；
   - 微信公众号文章末尾放「官网：xxx」；
   - 到「小众软件」「异次元软件世界」等中文软件站投稿（被收录后是高质量外链）；
   - 知乎、V2EX、少数派等社区回答「Windows 有什么好用的密码管理器」时自然提及。
5. **技术项已经做好**：结构化数据（软件信息 + FAQ）、sitemap、robots、移动端适配、单页无外部依赖（打开快）。
6. **耐心**：新域名有「沙盒期」，一般 1～3 个月才会稳定给排名。

---

## 六、以后每次改动都要做的三件事

```powershell
cd E:\Code\harness\safevault
node scripts/audit-site.cjs                                     # 锚点 / 资源 / 文案 / 域名占位符
node node_modules/electron/cli.js scripts/check-site.cjs        # 五个宽度布局 + 控制台报错 + 整页截图
node scripts/serve-site.cjs 8125                                # 本地预览 http://127.0.0.1:8125/
```

发布新版本时记得同步这几处：`index.html` 里的版本号与下载链接、`download/` 里的安装包文件名、`sitemap.xml` 的 `lastmod`、社交分享图（重新跑 `node node_modules/electron/cli.js scripts/make-og.cjs`）。
