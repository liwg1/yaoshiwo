# 钥匙窝 YaoShiWo v1.3.0

> 这份文件是 GitHub Release 的正文（CI 在打 tag 时自动读取并发布）。
> 标签：`v1.3.0`　产物：见下方「下载」表

## 一句话

浏览器扩展怎么装，这次讲明白了：设置面板里点一下就能下载扩展包，四步装完；导航和页脚也多了「源码在 GitHub」入口。

## 本版改动

| # | 改动 | 说明 |
| --- | --- | --- |
| 00 | 扩展安装改成「四步」 | 设置面板里直接点「下载扩展包」，然后：①下载并解压 ②打开 `chrome://extensions` 开开发者模式 ③加载已解压的扩展程序 ④粘贴访问令牌配对。官网同一套步骤 |
| 01 | 补上扩展排障说明 | 锁定时取不到凭证、重新生成令牌后要重新粘贴、换用户或重装浏览器要重做第②③步，这些坑都写进了设置面板与官网 |
| 02 | 官网加「源码在 GitHub」入口 | 导航栏与页脚各一处，跳 [liwg1/yaoshiwo](https://github.com/liwg1/yaoshiwo) |
| 03 | 根域名与 www 合并 | `yaoshiwo.cn` 现在 301 到 `https://www.yaoshiwo.cn`，证书一张覆盖两个域名，同一份内容不留两个地址 |

## 下载

| 文件 | 说明 | 大小 |
| --- | --- | --- |
| `YaoShiWo-Setup-1.3.0.exe` | 安装版，带开始菜单与桌面快捷方式，可正常卸载 | 约 81 MB |
| `YaoShiWo-portable.exe` | 免安装单文件版，可放 U 盘随身携带 | 约 81 MB |
| `YaoShiWo-chrome-extension.zip` | 浏览器扩展（Chrome / Edge，解压后「加载已解压的扩展程序」） | 约 17 KB |

官网下载（国内更快）：<https://www.yaoshiwo.cn/#download>

### SHA-256 校验值

安装版与免安装版的校验值见本 Release 附带的 `SHA256SUMS.txt`，官网另有汇总：
<https://www.yaoshiwo.cn/download/SHA256SUMS.txt>

Windows 下核对：`certutil -hashfile YaoShiWo-Setup-1.3.0.exe SHA256`，或 PowerShell `Get-FileHash .\YaoShiWo-Setup-1.3.0.exe -Algorithm SHA256`。

## 升级须知

1. **先彻底退出旧版**：托盘图标右键 → 退出。直接点窗口关闭按钮只是收进托盘，程序仍在运行，会导致安装时文件被占用。
2. 直接装新版即可，`appId` 未变，安装包会就地覆盖；数据无需迁移，密码库仍是原来的 `.kdbx` 文件。
3. **升级前建议先复制一份备份**——主密码丢失无法找回。

浏览器扩展这次没有改版本号，已装好的不用重装；没装过的按四步来。

## 兼容性

- 数据库格式：KDBX 3.1 / 4.0 / 4.1（Argon2 与 AES-KDF 均支持）。
- 与 KeePass 2.x **双向兼容**：KeePass 打开本软件保存的文件、本软件打开 KeePass 保存的文件均正常。
- 系统：Windows 10 / 11 x64。

## 许可

MIT License © 2026 liwg1 · 钥匙窝 YaoShiWo
