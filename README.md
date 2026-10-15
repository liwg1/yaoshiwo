# 钥匙窝 YaoShiWo

> 本地优先、不上传云端的 Windows 密码管理器 · 直接读写 KeePass 2 的 `.kdbx` 文件

[官网](https://yaoshiwo.cn) · [下载最新版](https://yaoshiwo.cn/#download) · [更新日志](CHANGELOG.md) · [MIT 协议](LICENSE)

---

## 这是什么

钥匙窝是一个**跑在你自己电脑上**的密码管理器。它不注册账号、不连服务器、不做遥测——你的密码库就是一个加密文件（`.kdbx`），放在你指定的目录里，可以随手拷进 U 盘、扔进网盘、或者用 KeePass 打开。

它的存在理由很简单：**大多数人的密码现在都存在别人的服务器上。** 那些服务一旦被拖库、被封号、或者哪天涨价停服，你的密码就跟着一起完蛋。钥匙窝把这件事拉回本地：**加密和解密都在你的机器上完成，主密码永远不出本机，也没有任何地方可以「找回」。**

同时它不是一个封闭的保险箱——文件格式就是 KeePass 的 KDBX，**你可以今天用钥匙窝、明天用 KeePass、后天用别的兼容软件，同一个文件来回打开，不会锁死在任何一家身上。**

## 功能

**密码库与兼容性**

- KDBX 3.1 / 4.x 读写，与 KeePass 2 双向兼容（同一个文件两边都能开、都能存）
- AES-256 加密 + Argon2id 密钥派生（用 `hash-wasm` 提供 Argon2 实现）
- 分组树、条目、备注、URL、自定义字段、附件、标签、过期时间
- TOTP 两步验证码（存密钥即用，不用掏手机也能看）
- 原生支持你已有的 `.kdbx`，不需要导入导出

**使用体验**

- 拼音模糊搜索：全拼和首字母都能搜（输 `zfb` 或 `zhifubao` 都能找到「支付宝」）
- 图标自动匹配：按域名抓网站 favicon；中文名条目（如「淘宝」「网易云音乐」）会先做中文名 → 常用网站匹配，命中度高就直接显示该网站 Logo，匹配不上才退回彩色首字母
- 分组按名称首字母自动配色，扫一眼就能定位
- 详情面板宽度可拖拽、字段值可横向滚动、字体大小可调、明暗主题切换
- 密码历史：每次改动密码自动留快照，可看历史明文、可清理「重复的密码历史」（清理前自动备份一份 `.bak-日期时间`）
- 密码生成器、剪贴板自动清除、最近使用记录（可单条删除）
- **不会背着你自动锁定**：是否自动锁定由你决定，默认关闭（否则浏览器扩展就没法自动填充了）

**系统集成**

- 点关闭按钮 ≠ 退出：可选「每次询问 / 放到状态栏 / 永久关闭」，放到状态栏时程序常驻，浏览器扩展继续可用
- 托盘图标 + 单实例锁（重复点图标只会把已有窗口叫出来，不会开一堆进程）
- 排除在系统自动锁定之外的一切行为都不做：不联网、不自动更新、不写日志到云端

**浏览器扩展（Chrome / Edge，MV3）**

- 登录页自动填充，输入框内联填充图标（多个账号可选）
- 登录/注册成功后询问是否保存新密码，一键写回本地密码库
- 扩展只跟本机 `127.0.0.1` 上的钥匙窝通信，带令牌校验，不经过任何外网

## 我们的「没有」

没有账号、没有注册、没有手机号、没有云端同步、没有遥测上报、没有广告、没有内购、没有「忘记密码」——**因为这七样东西一旦存在，就意味着你的密码在别人手里，或者能被别人打开。**

## 下载和安装

- 官网：<https://yaoshiwo.cn>
- GitHub Releases：<https://github.com/liwg1/yaoshiwo/releases>

| 文件 | 说明 |
| --- | --- |
| `YaoShiWo-Setup-x.y.z.exe` | 安装版，创建桌面快捷方式，可正常卸载 |
| `YaoShiWo-portable.exe` | 免安装版，双击即用，适合放 U 盘随身带 |
| `YaoShiWo-chrome-extension.zip` | 浏览器扩展，解压后加载 |

系统要求：Windows 10 / 11（64 位）。

**浏览器扩展安装**：解压 zip → 打开 `chrome://extensions` → 打开右上角「开发者模式」→「加载已解压的扩展程序」→ 选中解压出来的目录 → 回到钥匙窝「设置 → 浏览器扩展」启用服务（首次启用会显示令牌，扩展会自动读取）。

## 安全模型

- **主密码不落盘**：只用于本机派生密钥，程序在任何情况下都不保存、不上传，也没有任何后门或找回通道。
- **文件即全部**：所有数据（含密码历史、附件）都在 `.kdbx` 里，加密后即使文件被拿走，没有主密码也打不开。
- **唯一的对外网络行为**：抓取网站 favicon（只请求条目里那个域名，用于显示图标），失败就退回本地生成的首字母图标，不影响任何功能。
- **扩展通道**：仅监听 `127.0.0.1:38471`，请求必须带 `X-SafeVault-Token` 令牌（随机生成、存在你的用户配置目录），外网无法访问。
- **不做危险的事**：不注入系统、不装驱动、不读浏览器密码库、不静默上传。

> 说句实在话：任何密码管理器的安全性上限都是你的**主密码强度 + 电脑本身的安全性**。请用一句足够长的主密码，并且**定期备份 `.kdbx` 文件**——忘记主密码等于永久失去数据，这是本地加密的代价，也是它的意义。

## 技术栈

| 层 | 用了什么 |
| --- | --- |
| 桌面外壳 | Electron 33 + electron-vite |
| 界面 | React 18 + TypeScript + Tailwind CSS 3 + zustand + lucide-react |
| 密码库 | kdbxweb 2.1（KDBX 读写）+ hash-wasm 4.11（Argon2 派生） |
| 中文搜索 | pinyin-pro（全拼 / 首字母） |
| 打包 | electron-builder（NSIS 安装版 + portable 免安装版） |
| 官网 | 纯静态 HTML/CSS/JS，零依赖零构建 |

## 目录结构

```
src/
  main/            Electron 主进程：窗口、托盘、单实例、favicon 抓取、本地扩展服务
    index.ts         程序入口、IPC、托盘与关闭行为
    extension-server.ts  127.0.0.1:38471 本地服务（/status /query /save）
    tray-icon.ts     内嵌的托盘图标（base64 PNG）
  preload/         预加载脚本：把受控的 window.api 暴露给界面
  renderer/        React 界面
    src/lib/kdbx.ts    密码库读写封装（含 KeePass 时间格式兼容修复，见下）
    src/lib/pinyin.ts  拼音搜索
    src/lib/site-match.ts 中文名 → 常用网站匹配
    src/components/    各个界面组件
chrome-extension/  Chrome / Edge 扩展（MV3）
website/           官网静态站（直接双击 index.html 就能预览）
cover/             公众号封面与社交分享图的 HTML 源文件
scripts/           打包、部署、自检脚本（见下）
build/             应用图标等打包资源
```

## 本地开发

```bash
# 需要 Node.js 18+ （建议 20/22）
npm install
npm run dev            # 开发模式，改代码自动刷新
npm run build          # 只编译（产物在 out/）
npm run package:win    # 出 Windows 安装包与免安装版（产物在 release/）
npm run package:dir    # 只出解包目录，调试打包问题时用
```

类型检查：`node node_modules/typescript/lib/tsc.js --noEmit`

### 手边这些脚本

跑起来能省事的几个（都在 `scripts/`，纯 Node 或 Electron，无第三方依赖）：

| 脚本 | 干什么 |
| --- | --- |
| `node scripts/check-site.cjs` | 用 Electron 打开官网，在五种屏幕宽度下量有没有横向溢出、收集控制台报错、生成整页截图（适合没有肉眼可看时自检） |
| `node scripts/audit-site.cjs` | 纯静态检查：锚点是否有对应 id、资源是否存在、SEO 必需项与占位符是否残留 |
| `node scripts/serve-site.cjs 8125` | 零依赖静态服务器，本地预览官网（`http://127.0.0.1:8125/`） |
| `node scripts/smoke-app.cjs` | 启动打包后的真实程序，用 CDP 读窗口标题、页面文字、版本号，冒烟验证 |
| `node scripts/make-cover.cjs` / `make-og.cjs` | 用 HTML 生成公众号封面 / 社交分享卡片 PNG |
| `node scripts/deploy-aliyun.cjs recon\|deploy\|netcheck\|https\|status` | 部署官网到自己服务器：侦察 / 部署 / 排查外网不通 / 申请 HTTPS / 查线上状态（凭据只从环境变量读，见脚本头部注释） |
| `node scripts/verify-deploy.cjs` | 用 sha256 逐字节比对线上文件与本地文件（只看 HTTP 200 是不够的：旧文件也会返回 200） |
| `node scripts/push-github.cjs` | 自动建仓库 + 推送（需要 `GITHUB_TOKEN`，GitHub 已不支持密码认证） |

## 一个值得单独说的坑：KeePass 的 KDBX 4 时间格式

如果你也在用 `kdbxweb` 并且发现**存完之后 KeePass 打不开，报「输入的不是有效的 Base-64 字符串」**，原因在这里：

KeePass 的 `KdbxFile.ReadTime` 对 KDBX 4.x 的时间**一律**执行 `Convert.FromBase64String`——也就是说 4.x 的时间必须是「8 字节小端整数（自 0001 年起的秒数）+ Base64」。而 `kdbxweb` 在写 custom data / custom icon 的 `LastModificationTime` 时传了 `binary = false`，写成了 ISO 文本，于是 KeePass 一读就炸。

修复方式（见 `src/renderer/src/lib/kdbx.ts`）：把 `XmlUtils.setDate` 包一层，强制走二进制；同时在加载和新建之后调用 `db.setVersion(4)`。

```ts
const original = XmlUtils.setDate
;(XmlUtils as any).setDate = (node: any, date: any) => original(node, date, true)
```

这个坑排查起来很费时间（容易先怀疑密码、怀疑 KDF、怀疑压缩），所以写在最显眼的地方。

## 常见问题

**忘记主密码了怎么办？**
没有任何办法。主密码不保存在任何地方，这是本地加密的必然结果。请把主密码写在纸上锁进抽屉，并定期备份 `.kdbx` 文件。

**会上传我的密码吗？**
不会。程序没有服务端，唯一的网络请求是抓取网站图标（为了显示 Logo），可以在设置里关掉，关了功能一样用。

**能用我的旧 KeePass 数据库吗？**
能，直接打开 `.kdbx` 就行（KDBX 3.1 和 4.x 都支持）。建议第一次先用副本试一下，确认无误再日常使用。

**有手机版吗？**
目前只有 Windows 版。手机端可以继续用 KeePass 系的 App 打开同一个 `.kdbx` 文件——这也是选这个格式的好处。

**免费吗？**
免费，MIT 协议开源。

## 参与贡献

欢迎提 Issue 和 PR。提交前请确保 `tsc --noEmit` 通过；改官网的话顺手跑一遍 `check-site.cjs` 和 `audit-site.cjs`。

## 协议

[MIT](LICENSE) © 2026 liwg1 · 钥匙窝 YaoShiWo

## 免责声明

本软件按「原样」提供，不对数据丢失或任何间接损失负责。**请务必自己做好 `.kdbx` 文件的备份**——这是使用任何本地密码管理器的前提。
