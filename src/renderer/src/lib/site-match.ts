import { pinyin } from 'pinyin-pro'

export interface SiteMatch {
  domain: string
  score: number
}

interface SiteDef {
  names: string[]
  domain: string
}

/**
 * 常用网站中文名 / 别名 → 规范域名 映射表。
 * 用于：当条目没有可用 URL，或 URL 的 favicon 抓取失败时，
 * 根据中文标题模糊匹配出知名网站，从而拿到准确的网站 Logo。
 */
const SITES: SiteDef[] = [
  // 电商
  { names: ['淘宝', '淘宝网', 'taobao'], domain: 'www.taobao.com' },
  { names: ['天猫', 'tmall'], domain: 'www.tmall.com' },
  { names: ['京东', '京东商城', 'jd'], domain: 'www.jd.com' },
  { names: ['拼多多', 'pinduoduo', 'pdd'], domain: 'www.pinduoduo.com' },
  { names: ['苏宁易购', '苏宁', 'suning'], domain: 'www.suning.com' },
  { names: ['唯品会', 'vip'], domain: 'www.vip.com' },
  { names: ['当当', '当当网', 'dangdang'], domain: 'www.dangdang.com' },
  { names: ['亚马逊', '亚马逊中国', 'amazon'], domain: 'www.amazon.cn' },
  { names: ['什么值得买', 'smzdm'], domain: 'www.smzdm.com' },

  // 视频 / 娱乐
  { names: ['哔哩哔哩', 'bilibili', 'b站', 'B站'], domain: 'www.bilibili.com' },
  { names: ['优酷', 'youku'], domain: 'www.youku.com' },
  { names: ['爱奇艺', 'iqiyi'], domain: 'www.iqiyi.com' },
  { names: ['腾讯视频', 'v.qq'], domain: 'v.qq.com' },
  { names: ['芒果tv', '芒果TV', 'mgtv'], domain: 'www.mgtv.com' },
  { names: ['抖音', 'douyin'], domain: 'www.douyin.com' },
  { names: ['快手', 'kuaishou'], domain: 'www.kuaishou.com' },
  { names: ['小红书', 'xiaohongshu'], domain: 'www.xiaohongshu.com' },
  { names: ['youtube', '油管', 'Youtube'], domain: 'www.youtube.com' },
  { names: ['netflix', '奈飞', 'Netflix'], domain: 'www.netflix.com' },
  { names: ['网易云音乐', 'music.163'], domain: 'music.163.com' },
  { names: ['qq音乐', 'QQ音乐', 'y.qq'], domain: 'y.qq.com' },
  { names: ['喜马拉雅', 'ximalaya'], domain: 'www.ximalaya.com' },

  // 社交 / 通讯
  { names: ['微信', 'weixin', 'wechat'], domain: 'weixin.qq.com' },
  { names: ['腾讯', 'qq', 'QQ', 'tencent'], domain: 'www.qq.com' },
  { names: ['qq邮箱', 'QQ邮箱', 'mail.qq'], domain: 'mail.qq.com' },
  { names: ['微博', '新浪微博', 'weibo'], domain: 'weibo.com' },
  { names: ['知乎', 'zhihu'], domain: 'www.zhihu.com' },
  { names: ['豆瓣', 'douban'], domain: 'www.douban.com' },
  { names: ['贴吧', '百度贴吧', 'tieba'], domain: 'tieba.baidu.com' },
  { names: ['twitter', '推特', 'x', 'X'], domain: 'x.com' },
  { names: ['facebook', '脸书', 'Facebook'], domain: 'www.facebook.com' },
  { names: ['instagram', 'Instagram', 'ins'], domain: 'www.instagram.com' },
  { names: ['linkedin', '领英', 'LinkedIn'], domain: 'www.linkedin.com' },
  { names: ['telegram', 'Telegram', '电报'], domain: 'web.telegram.org' },
  { names: ['虎扑', 'hupu'], domain: 'www.hupu.com' },
  { names: ['v2ex', 'V2EX'], domain: 'www.v2ex.com' },

  // 邮箱 / 办公
  { names: ['网易邮箱', '163邮箱', 'mail.163'], domain: 'mail.163.com' },
  { names: ['126邮箱', 'mail.126'], domain: 'mail.126.com' },
  { names: ['gmail', '谷歌邮箱', 'Gmail'], domain: 'mail.google.com' },
  { names: ['outlook', 'Outlook'], domain: 'outlook.live.com' },
  { names: ['钉钉', 'dingtalk'], domain: 'www.dingtalk.com' },
  { names: ['飞书', 'feishu'], domain: 'www.feishu.cn' },
  { names: ['企业微信', 'work.weixin'], domain: 'work.weixin.qq.com' },
  { names: ['notion', 'Notion'], domain: 'www.notion.so' },
  { names: ['印象笔记', 'yinxiang', 'evernote'], domain: 'www.yinxiang.com' },
  { names: ['有道云笔记', '有道', 'note.youdao'], domain: 'note.youdao.com' },

  // 搜索 / 技术 / 社区
  { names: ['百度', 'baidu'], domain: 'www.baidu.com' },
  { names: ['谷歌', 'google', 'Google'], domain: 'www.google.com' },
  { names: ['bing', '必应', 'Bing'], domain: 'www.bing.com' },
  { names: ['github', 'GitHub', 'gh'], domain: 'github.com' },
  { names: ['gitee', '码云', 'Gitee'], domain: 'gitee.com' },
  { names: ['gitlab', 'GitLab'], domain: 'gitlab.com' },
  { names: ['csdn', 'CSDN'], domain: 'www.csdn.net' },
  { names: ['掘金', 'juejin'], domain: 'juejin.cn' },
  { names: ['博客园', 'cnblogs'], domain: 'www.cnblogs.com' },
  { names: ['简书', 'jianshu'], domain: 'www.jianshu.com' },
  { names: ['stackoverflow', 'Stack Overflow', 'stackoverflow.com'], domain: 'stackoverflow.com' },
  { names: ['吾爱破解', '52pojie'], domain: 'www.52pojie.cn' },

  // 金融 / 支付
  { names: ['支付宝', 'alipay'], domain: 'www.alipay.com' },
  { names: ['招商银行', 'cmbchina'], domain: 'www.cmbchina.com' },
  { names: ['工商银行', 'icbc'], domain: 'www.icbc.com.cn' },
  { names: ['建设银行', 'ccb'], domain: 'www.ccb.com' },
  { names: ['中国银行', 'boc'], domain: 'www.boc.cn' },
  { names: ['农业银行', 'abchina'], domain: 'www.abchina.com' },
  { names: ['交通银行', 'bankcomm'], domain: 'www.bankcomm.com' },
  { names: ['云闪付', 'unionpay'], domain: 'www.unionpayintl.com' },
  { names: ['paypal', 'PayPal', '贝宝'], domain: 'www.paypal.com' },

  // 出行 / 生活
  { names: ['美团', 'meituan'], domain: 'www.meituan.com' },
  { names: ['饿了么', 'eleme', 'ele'], domain: 'www.ele.me' },
  { names: ['携程', '携程旅行', 'ctrip'], domain: 'www.ctrip.com' },
  { names: ['去哪儿', 'qunar'], domain: 'www.qunar.com' },
  { names: ['飞猪', 'fliggy'], domain: 'www.fliggy.com' },
  { names: ['12306', '中国铁路', '铁路12306'], domain: 'www.12306.cn' },
  { names: ['滴滴出行', '滴滴', 'didi'], domain: 'www.didiglobal.com' },
  { names: ['高德地图', '高德', 'amap'], domain: 'www.amap.com' },
  { names: ['百度地图', 'map.baidu'], domain: 'map.baidu.com' },
  { names: ['自如', 'ziroom'], domain: 'www.ziroom.com' },

  // 硬件 / 数码
  { names: ['小米', 'mi', 'xiaomi'], domain: 'www.mi.com' },
  { names: ['华为', '华为商城', 'huawei', 'vmall'], domain: 'www.vmall.com' },
  { names: ['苹果', 'apple', 'Apple'], domain: 'www.apple.com.cn' },
  { names: ['荣耀', 'honor', 'hihonor'], domain: 'www.hihonor.com' },
  { names: ['oppo', 'OPPO'], domain: 'www.oppo.com' },
  { names: ['vivo', 'vivo'], domain: 'www.vivo.com' },
  { names: ['联想', 'lenovo'], domain: 'www.lenovo.com.cn' },
  { names: ['戴尔', 'dell'], domain: 'www.dell.com' },

  // 游戏
  { names: ['steam', 'Steam', '蒸汽'], domain: 'store.steampowered.com' },
  { names: ['epic', 'Epic', 'epicgames'], domain: 'store.epicgames.com' },

  // 其他
  { names: ['天眼查', 'tianyancha'], domain: 'www.tianyancha.com' },
  { names: ['企查查', 'qcc'], domain: 'www.qcc.com' },
  { names: ['菜鸟', '菜鸟裹裹', 'cainiao'], domain: 'www.cainiao.com' },
  { names: ['顺丰', 'sf-express', 'sfexpress'], domain: 'www.sf-express.com' }
]

function pinyinOf(s: string): string {
  try {
    return pinyin(s, { toneType: 'none', type: 'array' }).join('')
  } catch {
    return s
  }
}

// 预计算每个别名的拼音，避免匹配时重复调用
const PREPARED = SITES.map((s) => ({
  domain: s.domain,
  names: s.names.map((n) => norm(n)),
  pinyins: s.names.map((n) => norm(pinyinOf(n)))
}))

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s·_./\\()[\]（）【】-]+/g, '')
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1)
  let curr = new Array<number>(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

/** 归一化后的字符串相似度，范围 0~1 */
function strSim(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const short = x.length < y.length ? x : y
  const long = x.length < y.length ? y : x
  // 包含关系（较短者完整出现在较长者中，且至少 2 字符，避免单字误匹配）
  if (short.length >= 2 && long.includes(short)) {
    return 0.82 + 0.18 * (short.length / long.length)
  }
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length)
}

const cache = new Map<string, SiteMatch | null>()
const MAX_CACHE = 4000

/**
 * 用条目标题（中文名/拼音/英文别名）模糊匹配常用网站。
 * 返回匹配到的规范域名与相似度（0~1）；相似度低于 0.8 视为不匹配，返回 null。
 */
export function matchSite(title: string): SiteMatch | null {
  const t = title?.trim()
  if (!t) return null
  const cached = cache.get(t)
  if (cached !== undefined) return cached

  const tp = norm(pinyinOf(t))
  let best: SiteMatch | null = null
  for (const site of PREPARED) {
    for (let i = 0; i < site.names.length; i++) {
      const s = Math.max(strSim(t, site.names[i]), strSim(tp, site.pinyins[i]))
      if (s > (best?.score ?? 0)) best = { domain: site.domain, score: s }
    }
  }
  const result = best && best.score >= 0.8 ? best : null
  if (cache.size > MAX_CACHE) cache.clear()
  cache.set(t, result)
  return result
}
