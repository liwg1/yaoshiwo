# 钥匙窝 官网上线手册（阿里云 + GitHub + 搜索引擎收录）

页面本身已经做好了 SEO 基础：关键词化的标题与描述、Open Graph 分享卡片、结构化数据（SoftwareApplication + FAQPage）、`robots.txt`、`sitemap.xml`、移动端适配、单页 8 个语义化区块、无外部 CDN 依赖。

---

## 一、上线前必须做的一件事：替换域名占位符

全站有 4 个文件写着占位域名 `yaoshiwo.cn`，上线前全部替换成你的真实域名：

| 文件 | 要改的地方 |
|---|---|
| `website/index.html` | `<link rel="canonical">`、`og:url`、`og:image`、`twitter:image`、JSON-LD 里的 `url` / `downloadUrl` / `softwareHelp` / `image` / `screenshot` / `logo.url` |
| `website/sitemap.xml` | `<loc>` 与 `<image:loc>`，顺手把 `lastmod` 改成当天日期 |
| `website/robots.txt` | 末尾的 `Sitemap:` 一行 |

可以一次改完再检查：

```powershell
cd E:\Code\harness\safevault
node -e "const fs=require('fs'),p=require('path');const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):[p.join(d,e.name)]);for(const f of walk('website')){if(!/\.(html|xml|txt)$/.test(f))continue;const s=fs.readFileSync(f,'utf8');const n=(s.match(/YOUR-DOMAIN\.com/g)||[]).length;if(n)console.log(f+' 还有 '+n+' 处');}"
node scripts/audit-site.cjs
```

> `audit-site.cjs` 会直接把还没替换的占位域名标成问题，替换干净后才会输出 ✅。

---

## 二、传到阿里云服务器（主站，推荐）

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

## 三、上传到 GitHub

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

## 四、让百度 / 必应优先展示你的官网

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

## 五、以后每次改动都要做的三件事

```powershell
cd E:\Code\harness\safevault
node scripts/audit-site.cjs                                     # 锚点 / 资源 / 文案 / 域名占位符
node node_modules/electron/cli.js scripts/check-site.cjs        # 五个宽度布局 + 控制台报错 + 整页截图
node scripts/serve-site.cjs 8125                                # 本地预览 http://127.0.0.1:8125/
```

发布新版本时记得同步这几处：`index.html` 里的版本号与下载链接、`download/` 里的安装包文件名、`sitemap.xml` 的 `lastmod`、社交分享图（重新跑 `node node_modules/electron/cli.js scripts/make-og.cjs`）。
