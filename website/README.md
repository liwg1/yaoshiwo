# 钥匙窝 官网（静态站点）

纯静态页面，零依赖、零构建、无外部 CDN，双击 `index.html` 即可预览，也可以直接丢到任意 Web 服务器或对象存储。

> **要上线 / 传 GitHub / 提交搜索引擎收录，请看 [`DEPLOY.md`](DEPLOY.md)** —— 里面有阿里云 Nginx 配置、GitHub Pages 步骤、百度与必应站长平台的提交方法，以及"密码管理器"这类词的排名现实预期。

## 目录结构

```
website/
├─ index.html                 首页（单页站点，全部内容都在这里）
├─ assets/
│  ├─ css/style.css           全部样式
│  ├─ js/main.js              粒子背景、滚动动画、FAQ、导航
│  └─ img/logo.svg            站点图标 / 页眉 Logo
│     img/og-cover.png        社交分享图 1200×630（微信/GitHub/搜索引擎抓取用）
├─ robots.txt                告诉搜索引擎哪些能抓、sitemap 在哪
├─ sitemap.xml               站点地图（提交给百度/必应/Google）
├─ DEPLOY.md                 上线与 SEO 完整手册
├─ .gitignore                推 GitHub 时排除截图与安装包
├─ download/                 安装包（已放入 1.1.0 安装版与免安装版）
└─ preview/                  自检生成的整页截图（上线时不用传）
```

## 本地预览

方式一（推荐，和线上环境一致）：项目根目录执行

```powershell
cd E:\Code\harness\safevault
node scripts/serve-site.cjs 8125
# 浏览器打开 http://127.0.0.1:8125/
```

方式二：直接双击 `E:\Code\harness\safevault\website\index.html`（功能完整，只是 `file://` 下下载行为略有不同）。

方式三：用任意静态服务器（宝塔 / nginx / `npx serve`）指向 `website/` 目录。

## 上线要做的事

1. **域名（已完成）**：全站域名是 `https://yaoshiwo.cn`，`index.html` / `sitemap.xml` / `robots.txt` 都已指向它，`node scripts/audit-site.cjs` 输出 ✅。要换域名请照 `DEPLOY.md` 第一节的命令全局替换。

2. **部署（一条命令）**：`node scripts/deploy-aliyun.cjs deploy`（环境变量 `SAFEVAULT_SSH_HOST` / `SAFEVAULT_SSH_PASS`），细节与「安全组 / DNS / 备案」三件配套设置见 `DEPLOY.md` 第二节。

3. **放安装包（已放好，换版本时需要重做）**：把打包产物复制到 `website/download/` 并改成页面里写的文件名：
   - `E:\Code\harness\safevault\release\YaoShiWo-Setup-1.2.0.exe` → `website/download/YaoShiWo-Setup-1.2.0.exe`（当前已就位，80.8 MB）
   - `E:\Code\harness\safevault\release\YaoShiWo-portable.exe` → `website/download/YaoShiWo-portable.exe`（当前已就位，80.6 MB）

   （文件名里带空格在部分服务器/链接里容易出问题，所以统一改成短横线版本。如果换了版本号，记得同步改 `index.html` 里 `#download` 那一段的链接与文件名。）

4. **放浏览器扩展**：`chrome-extension\` 目录已打包成 `website/download/YaoShiWo-chrome-extension.zip`（18 KB，扩展版本 1.2.1），首页「浏览器扩展」那一段和下载卡片都已指向它；扩展内容有改动时重新打包一次即可：

   ```powershell
   node scripts/make-extension-zip.mjs
   ```

   别用 `Compress-Archive`：Windows PowerShell 5.1 生成的 zip 条目分隔符是反斜杠（`icons\icon16.png`），Chrome 解压后「加载已解压的扩展程序」会失败。`make-extension-zip.mjs` 是自己写的 zip 打包，条目名统一用 `/`，并已回读校验。

5. **更新校验值**：换过安装包或扩展包之后跑一次 `node scripts/gen-sums.cjs`，它会重算三个下载文件的 SHA-256 写进 `download/SHA256SUMS.txt`（首页下载区就指向这个文件）。

## SEO 已经内置的东西

- 关键词化标题 + 200 字以内的描述 + keywords，`lang="zh-CN"`
- Open Graph / Twitter 分享卡片（含 1200×630 的 `og-cover.png`，微信、GitHub、必应都用它）
- 结构化数据两段：`SoftwareApplication`（软件名、系统、版本、免费、下载地址、功能清单）+ `FAQPage`（六条常见问题，有机会在搜索结果里展开）
- `canonical`、`robots`、`sitemap.xml`、`robots.txt`
- 单页 8 个语义化区块、一个 `h1`、正确的 h2/h3 层级、无外部 CDN（打开快，国内访问友好）
- 站长平台验证 meta 的占位注释（百度 / 必应 / Google，拿到验证码后打开注释即可）

## 自检工具（改完页面后跑一遍）

```powershell
cd E:\Code\harness\safevault
node scripts/audit-site.cjs                                   # 纯 Node：锚点、资源引用、文案大纲
node node_modules/electron/cli.js scripts/check-site.cjs      # 查本地文件
node node_modules/electron/cli.js scripts/check-site.cjs http://127.0.0.1:8125/   # 查 http 预览
```

`check-site.cjs` 会在 1440/1280/1024/768/390 五个宽度下检查横向溢出与控制台报错，并生成整页截图到 `website/preview/`。

## 部署提示（阿里云）

- 最省事：把整个 `website/` 目录用 scp / 宝塔 / WinSCP 传到服务器，Nginx 指向该目录即可（`preview/` 可以不上传）。
- Nginx 关键配置：`index index.html;`、`try_files $uri $uri/ /index.html;`，并为 `.exe` 加上 `application/octet-stream`，避免浏览器直接以文本打开。
- 页面已内置一条 CSP（在 `index.html` 的 `<meta http-equiv="Content-Security-Policy">`）。其中 `frame-ancestors` 不能通过 meta 生效，如果需要防嵌套，请在 Nginx 里加一个响应头：`add_header Content-Security-Policy "frame-ancestors 'none'" always;`。
- **务必配 HTTPS**：下载可执行文件的站点没有 HTTPS，浏览器会给出「不安全」提示，很影响信任感。阿里云可以申请免费证书。
- 备案：域名指向国内服务器需要完成 ICP 备案，否则 80/443 会被拦；如果只是用 IP 临时看效果则不受影响。

## 页面结构一览

导航 / 首屏（粒子背景 + 应用界面示意 + 数据条）/ 功能九宫格 / 安全链路六步 / 浏览器扩展三步 / 云端与本机对比 / v1.1.0 更新日志 / 常见问题 / 下载 / 页脚。

改文案直接编辑 `index.html`；改配色改 `assets/css/style.css` 顶部的 `:root` 变量（`--cyan`、`--indigo` 是品牌主色）。
