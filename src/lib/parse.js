/**
 * 媒体元数据解析引擎
 * ------------------------------------------------------------------
 * PanSou 后端返回的是 Telegram 频道 / 插件抓取的原始条目，标题极度不规范：
 *   "🎭 成何体统 (2024) S02E15 ✨4K WEB-DL 🔶HDR10 DDP 1.03 GB"
 *   "资源名称：奥本海默 Oppenheimer (2023)"
 *   "066583-少爷爆笑求生记 (55集)  https://pan.quark.cn/s/xxx"
 *
 * 影视墙需要的是「作品」而不是「消息」，因此这里负责：
 *   1. 清洗标题 → 得到可展示的作品名
 *   2. 抽取结构化元数据（年份 / 清晰度 / 片源 / 剧集进度 / 音轨字幕 / 体积）
 *   3. 从正文中抽取 导演 / 主演 / 地区 / 简介
 *   4. 按作品归并去重，合并多来源的网盘链接
 */

/* ------------------------------------------------------------------ *
 * 常量表
 * ------------------------------------------------------------------ */

export const DISK_META = {
  quark:  { name: '夸克',   short: '夸克', color: '#4b7bff' },
  baidu:  { name: '百度网盘', short: '百度', color: '#2b6cff' },
  aliyun: { name: '阿里云盘', short: '阿里', color: '#ff6a00' },
  uc:     { name: 'UC 网盘', short: 'UC',   color: '#ff8a00' },
  xunlei: { name: '迅雷',   short: '迅雷', color: '#2b7fff' },
  tianyi: { name: '天翼云盘', short: '天翼', color: '#e02020' },
  mobile: { name: '移动云盘', short: '移动', color: '#0a7cff' },
  '115':  { name: '115 网盘', short: '115', color: '#00a1d6' },
  '123':  { name: '123 网盘', short: '123', color: '#00b96b' },
  pikpak: { name: 'PikPak', short: 'PikPak', color: '#7c5cff' },
  magnet: { name: '磁力链接', short: '磁力', color: '#8b93a7' },
  ed2k:   { name: '电驴链接', short: '电驴', color: '#8b93a7' },
  others: { name: '其他',   short: '其他', color: '#8b93a7' },
}

export const DISK_ORDER = [
  'quark', 'aliyun', 'baidu', 'uc', 'xunlei', '115', '123',
  'tianyi', 'mobile', 'pikpak', 'magnet', 'ed2k', 'others',
]

/** 分辨率识别：按优先级从高到低，命中即停 */
const RESOLUTION_RULES = [
  { re: /\b8k\b|4320p/i,                      label: '8K',    rank: 5 },
  { re: /\b4k\b|2160p|uhd\b/i,                label: '4K',    rank: 4 },
  { re: /1080[pi]|全高清|fhd\b/i,               label: '1080P', rank: 3 },
  { re: /720[pi]|高清hd\b/i,                   label: '720P',  rank: 2 },
  { re: /\b(480p|360p|标清)\b/i,               label: 'SD',    rank: 1 },
]

/** 片源 / 画质增强标签 */
const QUALITY_RULES = [
  { re: /remux/i,                       label: 'REMUX' },
  { re: /bdiso|原盘|blu-?ray|蓝光/i,      label: '蓝光' },
  { re: /web-?dl/i,                     label: 'WEB-DL' },
  { re: /webrip/i,                      label: 'WEBRip' },
  { re: /hdtv/i,                        label: 'HDTV' },
  { re: /杜比视界|dolby\s*vision|\bdv\b/i, label: '杜比视界' },
  { re: /hdr10\+|hdr10|\bhdr\b/i,        label: 'HDR' },
  { re: /臻彩|杜比全景声|atmos/i,          label: '全景声' },
  { re: /\bts\b|枪版|抢先版|cam\b/i,       label: '枪版' },
]

/** 语言 / 字幕 */
const LANG_RULES = [
  { re: /国英双语|国英多音轨|双语|多音轨/, label: '双语' },
  { re: /国语|普通话|国配/,               label: '国语' },
  { re: /粤语/,                         label: '粤语' },
  { re: /日语|日配/,                     label: '日语' },
  { re: /韩语/,                         label: '韩语' },
  { re: /英语/,                         label: '英语' },
]
const SUB_RULES = [
  { re: /中英特效字幕|特效字幕/, label: '特效字幕' },
  { re: /内封|内嵌|硬字幕/,      label: '内封字幕' },
  { re: /简繁英|中英|双语字幕/,   label: '双语字幕' },
  { re: /中字|中文字幕/,         label: '中字' },
]

/** 需要从标题里剔除的前缀噪声 */
const TITLE_PREFIXES = [
  /^【\s*(?:标题|片名|名称)\s*】\s*[:：]?\s*/,
  // 通用「xx名称：」「资源标题：」「片名：」…
  /^#?\s*[\u4e00-\u9fa5]{0,3}(?:资源名称|资源标题|名称|标题|片名|剧名)\s*[:：]\s*/,
  /^#?\s*(?:剧情|看点|简介|介绍|描述|摘要)\s*[:：]\s*/,
  /^◎?\s*译\s*名\s*[:：]?\s*/,
  /^#?\s*(?:短剧|综艺|电影|电视剧|动漫|动画|纪录片|剧集|番剧|国漫|美剧|韩剧|日剧|港剧)\s*[:：]\s*/,
  /^#(短剧|综艺|电影|电视剧|动漫|动画|纪录片|剧集|国漫|美剧|韩剧|日剧)\s*/,
  /^\[[^\]]{1,12}(网盘|资源|分享)\]\s*/,
  /^\d{4,8}\s*[-—]\s*/,              // "066583-少爷爆笑求生记"
  /^[A-Za-z]\s+(?=[\u4e00-\u9fa5])/, // "A 奥本海默"
]

/** 表情 / 装饰符号 */
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{2190}-\u{21FF}\u{2300}-\u{23FF}]/gu

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

const stripEmoji = (s) => (s || '').replace(EMOJI_RE, ' ')

/** 是否含有实际内容（中日韩文字或字母数字），而非纯标点 */
const hasMeaning = (s) => /[\u4e00-\u9fa5\u3040-\u30ffa-zA-Z0-9]/.test(s || '')

const OPENERS = '[【(（《'
const CLOSERS = ']】)）》'

/**
 * 括号配对扫描：遇到「永不闭合的开括号」或「凭空出现的闭括号」就在此截断。
 * 处理 "奥本海默 ]蓝光"、"金庸全集(新修版)[多格式.有了这个" 这类残缺串。
 */
function cutUnbalanced(s) {
  const stack = []
  for (let i = 0; i < s.length; i++) {
    const oi = OPENERS.indexOf(s[i])
    if (oi >= 0) { stack.push({ ch: oi, at: i }); continue }
    const ci = CLOSERS.indexOf(s[i])
    if (ci < 0) continue
    if (!stack.length) return s.slice(0, i)          // 多余的闭括号
    stack.pop()
  }
  return stack.length ? s.slice(0, stack[0].at) : s   // 未闭合的开括号
}

/** 全角 → 半角，压缩空白 */
function normalizeSpace(s) {
  return (s || '')
    .replace(/[\u3000\t\r\n]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/* ------------------------------------------------------------------ *
 * 单项元数据抽取
 * ------------------------------------------------------------------ */

/** 年份：优先括号内，其次点分隔（.2023.），最后裸年份 */
export function extractYear(text) {
  if (!text) return null
  const now = new Date().getFullYear() + 2
  const candidates = []
  const push = (v, weight) => {
    const y = parseInt(v, 10)
    if (y >= 1900 && y <= now) candidates.push({ y, weight })
  }
  for (const m of text.matchAll(/[（(【\[]\s*((?:19|20)\d{2})\s*[)）】\]]/g)) push(m[1], 3)
  for (const m of text.matchAll(/[.\s]((?:19|20)\d{2})[.\s]/g)) push(m[1], 2)
  for (const m of text.matchAll(/\b((?:19|20)\d{2})\b/g)) push(m[1], 1)
  if (!candidates.length) return null
  candidates.sort((a, b) => b.weight - a.weight)
  return candidates[0].y
}

export function extractResolution(text) {
  if (!text) return null
  for (const r of RESOLUTION_RULES) if (r.re.test(text)) return r
  return null
}

export function extractQuality(text) {
  if (!text) return []
  const out = []
  for (const r of QUALITY_RULES) if (r.re.test(text) && !out.includes(r.label)) out.push(r.label)
  return out
}

export function extractLangSub(text) {
  const langs = [], subs = []
  if (!text) return { langs, subs }
  for (const r of LANG_RULES) if (r.re.test(text) && !langs.includes(r.label)) langs.push(r.label)
  for (const r of SUB_RULES) if (r.re.test(text)) { subs.push(r.label); break }
  return { langs, subs }
}

/**
 * 剧集进度：区分「完结」与「更新中」
 * 支持：全24集 / 24集全 / 已完结第11话 / 更至EP138 / 更新至19集 / S02E15 / 更0725期
 */
export function extractEpisode(text) {
  if (!text) return null
  let m

  if ((m = text.match(/(?:全|共)\s*(\d{1,4})\s*[集话話期]/))) 
    return { label: `全 ${m[1]} 集`, total: +m[1], done: true }
  if ((m = text.match(/(\d{1,4})\s*[集话話]\s*全/)))
    return { label: `全 ${m[1]} 集`, total: +m[1], done: true }
  if ((m = text.match(/已?完结\s*(?:第)?\s*(\d{1,4})\s*[集话話]/)))
    return { label: `完结 ${m[1]} 集`, total: +m[1], done: true }
  if (/已?完结|全集|完结撒花/.test(text) && !/未完结/.test(text))
    return { label: '已完结', total: null, done: true }
  // 综艺按「期」更新，且常写成 更0725 / 更至0731第5期 —— 需先于「集」匹配
  if ((m = text.match(/更(?:新)?至?\s*(\d{3,4})\s*(?:第\d{1,3}期\d*|期)?/))) {
    const d = m[1]
    if (d.length === 4 && +d.slice(0, 2) <= 12 && +d.slice(0, 2) >= 1)
      return { label: `更至 ${+d.slice(0, 2)}/${d.slice(2)} 期`, total: null, done: false }
  }
  if ((m = text.match(/更(?:新)?至?\s*(?:第)?\s*(?:EP)?\s*(\d{1,4})\s*[集话話]/i)))
    return { label: `更至 ${m[1]} 集`, total: +m[1], done: false }
  if ((m = text.match(/更(?:新)?至?\s*(?:第)?\s*(\d{1,3})\s*期/)))
    return { label: `更至 ${m[1]} 期`, total: null, done: false }
  if ((m = text.match(/更(?:新)?至\s*(?:第)?\s*(?:EP)?\s*(\d{1,4})/i)))
    return { label: `更至 ${m[1]} 集`, total: +m[1], done: false }
  if ((m = text.match(/S(\d{1,2})E(\d{1,3})/i)))
    return { label: `S${m[1]}E${m[2]}`, total: null, done: false }
  if (/更新中|连载中/.test(text)) return { label: '更新中', total: null, done: false }
  if ((m = text.match(/[（(]\s*(\d{1,4})\s*集\s*[)）]/)))
    return { label: `${m[1]} 集`, total: +m[1], done: true }
  return null
}

/** 季数：第三季 / S02 / 第2季 */
export function extractSeason(text) {
  if (!text) return null
  const cn = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 }
  let m
  if ((m = text.match(/第\s*([一二三四五六七八九十]|\d{1,2})\s*季/)))
    return cn[m[1]] ?? parseInt(m[1], 10)
  if ((m = text.match(/\bS(\d{1,2})(?:E\d{1,3})?\b/i))) return parseInt(m[1], 10)
  return null
}

/** 文件体积：27.3G / 1.03 GB / 110GB */
export function extractSize(text) {
  if (!text) return null
  const m = text.match(/(\d+(?:\.\d+)?)\s*(TB|GB|MB|T|G|M)\b/i)
  if (!m) return null
  const unit = m[2].toUpperCase().replace(/^([TGM])$/, '$1B')
  return `${m[1]}${unit}`
}

/* ------------------------------------------------------------------ *
 * 标题清洗
 * ------------------------------------------------------------------ */

/**
 * 把一条脏标题清洗成可展示的作品名。
 * 策略：先剥前缀噪声 → 去 URL / 表情 → 去技术性方括号块 →
 *       在第一个「技术标记」处截断（如 4K、WEB-DL、全24集…）
 */
export function cleanTitle(raw, depth = 0) {
  let t = normalizeSpace(raw || '')
  if (!t) return ''

  // 1) 链接、投稿账号、表情
  t = t.replace(/https?:\/\/\S+/g, ' ')
       .replace(/magnet:\?\S+/g, ' ')
       .replace(/@[A-Za-z0-9_]{4,}/g, ' ')
  t = normalizeSpace(stripEmoji(t))

  // 2) 反复剥离前缀（可能叠加，如 "#综艺 名称：xxx"）
  for (let i = 0; i < 4; i++) {
    let changed = false
    for (const re of TITLE_PREFIXES) {
      const next = t.replace(re, '')
      if (next !== t) { t = normalizeSpace(next); changed = true }
    }
    if (!changed) break
  }

  // 3) 正文型条目只取首段
  t = t.split(/描述\s*[:：]|介绍\s*[:：]|简介\s*[:：]|链接\s*[:：]|标签\s*[:：]|大小\s*[:：]/)[0]
  t = normalizeSpace(t)

  // 4) 《作品名》优先——这是最可靠的标题信号（内部可能仍带方括号，递归清洗一层）
  const book = t.match(/《([^》]{1,60})》/)
  if (book) {
    const inner = normalizeSpace(book[1])
    return depth < 2 ? cleanTitle(inner, depth + 1) || inner : inner
  }

  // 5) 剥离开头的标注块（【原盘】【电影】…），并记住第一个块
  //    若剥完什么都不剩，说明标题本身就在方括号里（如 "[奥本海默][2023][4K]"）
  let firstBlock = ''
  for (let i = 0; i < 6; i++) {
    const m = t.match(/^\s*[\[【]\s*([^\[\]【】]{1,40})\s*[\]】]\s*/)
    if (!m) break
    if (!firstBlock) firstBlock = normalizeSpace(m[1])
    t = t.slice(m[0].length)
  }
  // 剥完只剩标点 → 说明标题本身就在第一个方括号里
  if (!hasMeaning(t.replace(/[\[【][^\[\]【】]*[\]】]/g, '')) && firstBlock) t = firstBlock

  // 6) 截断发布组命名（Three.Body.Problem.S01.1080p.NF.WEB-DL…）
  const rel = t.search(/[-–—\s][A-Za-z0-9][A-Za-z0-9'’]*(?:\.[A-Za-z0-9'’]+){2,}/)
  if (rel > 2) t = t.slice(0, rel)

  // 7) 在首个技术标记处截断
  const cutRe =
    /\s*[\[【(（]?\s*(?:4K|8K|2160p|1080[pi]|720[pi]|WEB-?DL|WEBRip|BluRay|Blu-ray|BDISO|REMUX|HDTV|HDR10?\+?|SDR|S\d{1,2}E\d{1,3}|H\.?26[45]|x26[45]|AAC|DDP?[0-9.]*|Atmos|FLAC|10bit|60FPS|NF\b|臻彩|高码|原盘|补档|添加|杜比[视全]|全\s*\d{1,4}\s*[集话話]|\d{1,4}\s*[集话話]\s*全|更\s*(?:新)?至?\s*\d|已?完结|中英|中字|国语|英语|双语|多音轨|外挂|内封|硬字幕|特效字幕|合集|最新|满屏|\d+(?:\.\d+)?\s*[TGM]B?\b)/i
  const cut = t.search(cutRe)
  if (cut > 1) t = t.slice(0, cut)

  // 8) 清掉残余的括号块、集数括号与年份（这些都单独展示）
  t = t.replace(/[\[【][^\[\]【】]{0,40}[\]】]/g, ' ')
  t = t.replace(/[（(]\s*(?:19|20)\d{2}\s*[)）]/g, ' ')
  t = t.replace(/[（(]\s*\d{1,4}\s*[集话話期]\s*[)）]/g, ' ')
  t = t.replace(/\s(?:19|20)\d{2}\s*$/g, ' ')
  // 尾部的分类后缀（"…… | 短剧"、"…… | 综艺"、"……韩国电影"）
  t = t.replace(/\s*[|｜]\s*(?:短剧|综艺|电影|电视剧|动漫|动画|纪录片|剧集|国漫|韩国电影|韩国电影剧情|电影剧情|国产剧|欧美剧|美剧|韩剧|日剧|港剧|泰剧)\s*[·.]?\s*$/g, ' ')

  // 8.5) 整段元数据被当成标题时（"八路军导演：宋业明…"），在字段标签处截断
  const fieldLabel = t.search(/(?:导演|主演|编剧|上映|更新|豆瓣|评分|类型|地区|状态|剧情|简介|看点|介绍|描述|出品|制片|声优|画师|原作|分类|关键字)[:：]/)
  if (fieldLabel > 0 && fieldLabel <= 24) t = normalizeSpace(t.slice(0, fieldLabel))
  // 再次清掉截断后残留的尾部分类词
  t = t.replace(/\s*(?:韩国电影|韩国电影剧情|电影剧情|国产剧|欧美剧|美剧|韩剧|日剧|港剧|泰剧)\s*[·.]?\s*$/g, ' ')

  // 9) 括号配对扫描，截掉残缺尾巴
  const balanced = cutUnbalanced(t)
  if (hasMeaning(balanced)) t = balanced

  // 10) 收尾
  t = normalizeSpace(t)
  t = t.replace(/[\s·、,，.。\-–—_|/\\~～+【】\[\]（）()]+$/g, '')
       .replace(/^[\s·、,，.。\-–—_|/\\~～+【】\[\]（）()]+/g, '')
  return normalizeSpace(t)
}

/**
 * 归并键：把清洗后的标题进一步规范化，用于判断「是否同一部作品」。
 * 去掉年份、季、空格、标点，只保留中英数字。
 */
export function mediaKey(title, season, year) {
  let k = (title || '').toLowerCase()
  k = k.replace(/[（(【\[]\s*(?:19|20)\d{2}\s*[)）】\]]/g, '')
  k = k.replace(/第\s*[一二三四五六七八九十\d]{1,3}\s*季/g, '')
  k = k.replace(/\bs\d{1,2}(e\d{1,3})?\b/gi, '')

  // 中文作品常带英文副名（"奥本海默 Oppenheimer"）——有中文时丢弃 ASCII 部分再归并
  const hasCJK = /[\u4e00-\u9fa5]/.test(k)
  if (hasCJK) k = k.replace(/[a-z0-9'’.\-]+/g, '')

  k = k.replace(/[^\u4e00-\u9fa5a-z0-9]/g, '')
  if (!k) return ''
  // 季度参与归并，年份不参与（同一部片各来源标注的年份常有出入）
  return [k, season ?? ''].join('|')
}

/* ------------------------------------------------------------------ *
 * 正文结构化抽取
 * ------------------------------------------------------------------ */

const FIELD_RE = {
  actors:   /(?:主演|演员)\s*[:：]\s*(.{1,220})/,
  director: /(?:导演|监督)\s*[:：]\s*(.{1,140})/,
  region:   /(?:地区|国家|产地)\s*[:：]\s*(.{1,60})/,
  status:   /状态\s*[:：]\s*(.{1,40})/,
  category: /(?:类型|题材)\s*[:：]\s*(.{1,80})/,
}

/** 字段值截断：这些正文用 emoji 当分隔符，必须在下一个字段标签或表情处切断 */
const FIELD_STOP =
  /\s*(?:[|｜\n]|语言\s*[:：]|主演\s*[:：]|导演\s*[:：]|地区\s*[:：]|状态\s*[:：]|类型\s*[:：]|年份\s*[:：]|简介\s*[:：]|描述\s*[:：]|介绍\s*[:：]|链接\s*[:：]|大小\s*[:：]|标签\s*[:：]|集数\s*[:：]|更新\s*[:：])/

function trimFieldValue(v) {
  let s = String(v || '')
  // 先在 emoji 处截断（正文常见 "China🗣 语言：..."）
  const em = s.search(EMOJI_RE)
  if (em > 0) s = s.slice(0, em)
  const st = s.search(FIELD_STOP)
  if (st > 0) s = s.slice(0, st)
  return normalizeSpace(stripEmoji(s)).replace(/[,，、/|·\s]+$/, '')
}

export function parseContent(content) {
  const out = { actors: [], director: [], region: '', status: '', category: [], overview: '' }
  if (!content) return out
  const text = content

  for (const [key, re] of Object.entries(FIELD_RE)) {
    const m = text.match(re)
    if (!m) continue
    const v = trimFieldValue(m[1])
    if (!v) continue
    if (key === 'actors' || key === 'director' || key === 'category') {
      out[key] = v.split(/[,，、/]/).map((s) => s.trim()).filter(Boolean).slice(0, 20)
    } else {
      out[key] = v
    }
  }

  // 简介：描述： / 介绍： / 📜介绍：
  const ov = text.match(/(?:描述|介绍|简介|剧情)\s*[:：]\s*([\s\S]{10,600}?)(?:链接\s*[:：]|🔗|📁|🏷|https?:\/\/|magnet:|投稿|📢|👥|$)/)
  if (ov) out.overview = normalizeSpace(stripEmoji(ov[1]))
  return out
}

/* ------------------------------------------------------------------ *
 * 单条 → 媒体项
 * ------------------------------------------------------------------ */

function pickPoster(images) {
  if (!Array.isArray(images) || !images.length) return null
  // 站内 vod 海报（竖版封面）通常优于 Telegram 预览图，优先取
  const vod = images.find((u) => /vod|cover|poster|img\./i.test(u) && !/telesco\.pe/i.test(u))
  return vod || images[0]
}

/** 把一条 API 结果转换成结构化媒体项 */
export function toMediaItem(raw) {
  const rawTitle = raw.title || raw.content || ''
  // 标题过短或缺失时，退回正文首行
  const source = rawTitle.length < 4 && raw.content ? raw.content : rawTitle

  let title = cleanTitle(source)
  if (!hasMeaning(title)) {
    // 兜底：去掉链接与表情后截断，仍无有效内容则判定为无效条目
    const fb = normalizeSpace(
      stripEmoji(String(source).replace(/https?:\/\/\S+/g, ' ').replace(/magnet:\?\S+/g, ' ')),
    ).slice(0, 60)
    title = hasMeaning(fb) ? fb : ''
  }

  const hay = `${rawTitle} ${raw.content || ''}`
  const parsed = parseContent(raw.content)

  const year = extractYear(rawTitle) ?? extractYear(raw.content)
  const season = extractSeason(rawTitle)
  const resolution = extractResolution(hay)
  const quality = extractQuality(hay)
  const { langs, subs } = extractLangSub(hay)
  const episode = extractEpisode(rawTitle) || extractEpisode(parsed.status) || extractEpisode(raw.content)
  const size = extractSize(rawTitle) || extractSize(raw.content)

  const links = (raw.links || [])
    .filter((l) => l && l.url)
    .map((l) => ({
      type: DISK_META[l.type] ? l.type : 'others',
      rawType: l.type,
      url: String(l.url).replace(/&amp;/g, '&'),
      password: l.password || '',
    }))

  const tags = (raw.tags || [])
    .map((t) => normalizeSpace(stripEmoji(String(t))))
    .filter((t) => t && t.length <= 12 && !/^\d+$/.test(t))

  return {
    id: raw.unique_id || `${raw.channel || 'x'}-${raw.message_id || Math.random().toString(36).slice(2)}`,
    title,
    rawTitle,
    year,
    season,
    resolution,
    quality,
    langs,
    subs,
    episode,
    size,
    poster: pickPoster(raw.images),
    images: raw.images || [],
    tags,
    links,
    channel: raw.channel || '',
    datetime: raw.datetime && !raw.datetime.startsWith('0001') ? raw.datetime : null,
    ...parsed,
  }
}

/* ------------------------------------------------------------------ *
 * 归并去重
 * ------------------------------------------------------------------ */

const uniqBy = (arr, keyFn) => {
  const seen = new Set(), out = []
  for (const x of arr) {
    const k = keyFn(x)
    if (seen.has(k)) continue
    seen.add(k); out.push(x)
  }
  return out
}

/**
 * 将同一部作品的多条消息合并为一个影视墙卡片。
 * 合并内容：网盘链接、标签、海报、简介、来源数。
 */
export function mergeMedia(items) {
  const map = new Map()

  for (const it of items) {
    if (!it.title) continue
    const key = mediaKey(it.title, it.season, it.year) || it.id
    const cur = map.get(key)

    if (!cur) {
      map.set(key, {
        ...it,
        key,
        sources: 1,
        channels: it.channel ? [it.channel] : [],
        variants: [it],
      })
      continue
    }

    // 标题取更短更干净的那个（通常噪声更少）
    if (it.title.length < cur.title.length && it.title.length >= 2) cur.title = it.title

    cur.sources += 1
    if (it.channel && !cur.channels.includes(it.channel)) cur.channels.push(it.channel)
    cur.variants.push(it)

    cur.links = uniqBy([...cur.links, ...it.links], (l) => l.url)
    cur.tags = uniqBy([...cur.tags, ...it.tags], (t) => t).slice(0, 12)

    if (!cur.poster && it.poster) cur.poster = it.poster
    if (!cur.year && it.year) cur.year = it.year
    if (!cur.episode && it.episode) cur.episode = it.episode
    if (!cur.size && it.size) cur.size = it.size
    if (!cur.region && it.region) cur.region = it.region
    if (!cur.director?.length && it.director?.length) cur.director = it.director
    if (!cur.actors?.length && it.actors?.length) cur.actors = it.actors
    if ((it.overview || '').length > (cur.overview || '').length) cur.overview = it.overview

    // 保留更高的清晰度
    if (it.resolution && (!cur.resolution || it.resolution.rank > cur.resolution.rank))
      cur.resolution = it.resolution
    cur.quality = uniqBy([...(cur.quality || []), ...(it.quality || [])], (q) => q)
    cur.langs = uniqBy([...(cur.langs || []), ...(it.langs || [])], (q) => q)

    if (!cur.datetime && it.datetime) cur.datetime = it.datetime
    else if (it.datetime && cur.datetime && it.datetime > cur.datetime) cur.datetime = it.datetime
  }

  return [...map.values()]
}

/**
 * 排序评分：影视墙优先展示「信息完整、来源多、清晰度高」的条目。
 */
export function scoreMedia(m) {
  let s = 0
  if (m.poster) s += 40
  if (m.year) s += 10
  if (m.overview) s += 8
  if (m.actors?.length) s += 6
  if (m.resolution) s += m.resolution.rank * 4
  s += Math.min(m.sources, 8) * 3
  s += Math.min(m.links.length, 10) * 2
  if (m.tags?.length) s += 3
  // 标题过长通常是噪声条目
  if (m.title.length > 40) s -= 12
  if (m.title.length > 70) s -= 20
  return s
}

/**
 * 推断作品类型，用于「电影 / 剧集 / 综艺」筛选。
 * 优先级：综艺 > 短剧/剧集（含「集」） > 电影。
 */
export function mediaKind(m) {
  const txt = `${(m.tags || []).join(' ')} ${(m.category || []).join(' ')} ${m.title || ''}`
  if (/综艺/.test(txt)) return 'show'
  if (/短剧/.test(txt)) return 'series'
  if (m.episode) {
    if (/期/.test(m.episode.label || '')) return 'show'
    return 'series'
  }
  return 'movie'
}

/** 影视墙筛选栏提供的「画质」维度（剔除过于常见的片源标签） */
export const FILTER_QUALITIES = ['8K', '4K', '1080P', '720P', '蓝光', 'HDR', '杜比视界', 'REMUX', '枪版']

/**
 * 支持网页端在线播放的网盘，按播放体验从好到差排序。
 * magnet / ed2k / others 无法直接在浏览器里播放，不进入此列表。
 */
export const PLAYABLE_ORDER = [
  'quark', 'aliyun', 'uc', 'xunlei', '123', '115', 'baidu', 'tianyi', 'mobile', 'pikpak',
]

/**
 * 从一组链接里挑出最适合「直接播放」的那条。
 * 找不到可播放网盘时退回任意 http 链接；纯磁力条目返回 null。
 */
export function pickPlayable(links) {
  if (!Array.isArray(links) || !links.length) return null
  for (const t of PLAYABLE_ORDER) {
    const hit = links.find((l) => l.type === t && /^https?:/i.test(l.url || ''))
    if (hit) return hit
  }
  return links.find((l) => /^https?:/i.test(l.url || '')) || null
}

/** 是否存在可在线播放的网盘链接 */
export function hasPlayable(m) {
  return !!pickPlayable(m && m.links)
}

/**
 * 由标题派生稳定色相（0-359），用于无海报时生成不重样但可复现的占位图。
 */
export function titleHue(s) {
  const str = String(s || '?')
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h) % 360
}

/** 主入口：原始结果数组 → 影视墙数据 */
export function buildLibrary(rawResults) {
  const items = (rawResults || []).map(toMediaItem).filter((i) => i.title && i.links.length)
  const merged = mergeMedia(items)
  for (const m of merged) m.score = scoreMedia(m)
  merged.sort((a, b) => b.score - a.score)
  return merged
}
