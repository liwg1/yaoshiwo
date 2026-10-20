# 让百度 / 必应收录「钥匙窝」的操作清单

> 目标：搜索「钥匙窝」时，第一页就是我们的官网。
> 现状（2026-10-20）：站点首次真正对外可访问（HTTPS 已通），**搜索引擎还不知道它存在**，所以搜不到是正常的，不是哪里坏了。

## 为什么现在搜不到（按影响从大到小）

1. **站点是今天才真正在线的。** 之前的解析、端口、备案都没打通，搜索引擎爬虫来过也是空手而归。新站从上线到有收录，百度一般 1–4 周，必应/Google 快一些（几天）。
2. **没做过站长验证，也没提交过 sitemap。** 搜索引擎不会主动发现一个没人链接的新站。
3. **「钥匙窝」这几个字本身有竞争。** 搜「钥匙窝」出来的多是「钥匙盒」「密码钥匙盒」这类五金件商品；搜「SafeVault」又是别人的软件。得靠**定向内容**把品牌词抢回来。
4. **没有外链。** 收录速度和外部链接数量强相关。

## 需要你（只在你自己账号里能做）提供的两样东西

1. ~~**ICP 备案号**~~ ✅ 已拿到并上线：**陕ICP备2026029660号**（2026-10-20 通过审核）。页脚底部居中显示、链接到 `https://beian.miit.gov.cn/`，`website/index.html` 的 `.footer-icp` + `style.css` 的 `.footer-icp` 规则。
   - 如果工信部备案查询页上是带序号的 `陕ICP备2026029660号-1` 这种格式，告诉我，我加上 `-1`。
   - 之后再办**公安联网备案**（30 日内），拿到「公网安备 xxxxxxxx 号」后同样放在页脚，我再补。
2. **三家站长平台的验证码**（在各自平台添加网站后会给你）：
   - 百度搜索资源平台 → `<meta name="baidu-site-verification" content="codeva-xxxxxx" />`
   - 必应站长工具 → `<meta name="msvalidate.01" content="xxxxxxxx" />`
   - Google Search Console → `<meta name="google-site-verification" content="xxxxxxxx" />`

`website/index.html:16-18` 已经留好了这三个 meta 的位置，把码发我就行，我替换后重新部署。

## 具体操作步骤

### 一、百度搜索资源平台（最关键，国内用户主要用它）

1. 打开 <https://ziyuan.baidu.com> 用百度账号登录 → 「用户中心 → 站点管理 → 添加网站」。
2. 填 `https://www.yaoshiwo.cn`（先填 www；根域名解析好之后再补 `https://yaoshiwo.cn`）。
3. 验证方式选 **HTML 标签验证**，把给的 `codeva-xxxx` 发我。
4. 验证通过后 → 「普通收录 → 资源提交 → sitemap」填：`https://www.yaoshiwo.cn/sitemap.xml`（**不要**再填根域名，根域名现在解析还没指向我们的服务器）。
5. 顺便在「普通收录 → 资源提交 → 手动提交」里粘贴首页 URL，一天能提几条，加速发现。
6. 每天看一次「普通收录 → 收录量」，通常 3–7 天开始出现。

### 二、必应站长工具

1. 打开 <https://www.bing.com/webmasters> 登录 → 「添加网站」→ 填 `https://www.yaoshiwo.cn`。
2. 验证方式同样选 meta 标签，把 `msvalidate.01` 的值发我。
3. 「Sitemap」里提交 `https://www.yaoshiwo.cn/sitemap.xml`。
4. 必应还支持从 Google Search Console 一键导入，两个都做了更省事。

### 三、Google Search Console

1. <https://search.google.com/search-console> → 「添加资源」→ 选「网址前缀」，填 `https://www.yaoshiwo.cn`。
2. 验证方式选 HTML 标记，把 `google-site-verification` 的值发我。
3. 「Sitemap」提交 `https://www.yaoshiwo.cn/sitemap.xml`。
4. 用「网址检查」工具对首页点一次「请求编入索引」。

### 四、内容与外链（真正决定排名，不是技术活）

- **公众号文章就是最好的外链来源**：文章里放官网链接（`docs/wechat-rename-and-launch.md` 已写好），发出去后公众号文章会被搜狗、微信搜一搜收录，也会被百度少量抓取。
- 去 **知乎 / V2EX / 少数派 / 掘金 / CSDN** 各发一篇「本地密码管理器」的实操贴，正文里自然带上官网链接（别硬广，会被删）。
- GitHub 仓库 README 顶部放官网链接（已有），GitHub 页面本身在百度和必应权重都不低。
- 「钥匙窝」这个词要和「密码管理器」「本地加密」「KeePass 兼容」「不上传云端」这些词一起出现——搜索时用户多半是搜后面这些，品牌词靠时间养。

## 做完之后怎么验证

- 百度：直接搜 `site:yaoshiwo.cn`，有结果 = 已收录。
- 必应：搜 `site:yaoshiwo.cn`。
- 服务器上能看到爬虫来访：`tail -f /var/log/nginx/yaoshiwo.cn.access.log | grep -Ei "baiduspider|bingbot|googlebot"`。

## 技术侧已经做好的部分（不需要你再动）

- `robots.txt` 允许抓取，`Sitemap:` 指向 `https://www.yaoshiwo.cn/sitemap.xml`
- `sitemap.xml` 的 `loc`、`image:loc`、`lastmod` 已同步为 www 域名与内容更新日期
- 首页带完整的 `canonical` / `og:*` / `twitter:*` / JSON-LD（`SoftwareApplication`，含 `downloadUrl`、`operatingSystem`、`offers`）
- HTTP 全部 301 到 HTTPS（搜索引擎把 http 与 https 视为不同站点，不做跳转会分散权重）
- HTTPS 证书由 Let's Encrypt 签发，90 天自动续期
