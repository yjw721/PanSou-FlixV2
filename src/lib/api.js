import { buildLibrary } from './parse.js'

const DEFAULT_BASE = 'https://so.252035.xyz'

function getBase() {
  try {
    const v = localStorage.getItem('pansou_api_base')
    if (v && v.trim()) return v.trim().replace(/\/+$/, '')
  } catch (e) {
    /* localStorage 不可用时回退默认 */
  }
  return ''
}

/** 设置 / 清除 API 基址（持久化到 localStorage） */
export function setBase(v) {
  try {
    if (v && v.trim()) localStorage.setItem('pansou_api_base', v.trim().replace(/\/+$/, ''))
    else localStorage.removeItem('pansou_api_base')
  } catch (e) {
    /* ignore */
  }
}

export function getBaseUrl() {
  return getBase() || DEFAULT_BASE
}

/** 连通性探测（/api/health） */
export async function health(base) {
  const url = `${base || getBase() || DEFAULT_BASE}/api/health`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
    return r.ok
  } finally {
    clearTimeout(timer)
  }
}

/** 从多种可能的响应结构中抽取原始结果数组 */
function extractResults(json) {
  if (!json) return []
  if (Array.isArray(json)) return json
  if (Array.isArray(json.results)) return json.results
  if (json.data) {
    if (Array.isArray(json.data.results)) return json.data.results
    if (Array.isArray(json.data)) return json.data
    if (json.data.merged_by_type) {
      const out = []
      for (const v of Object.values(json.data.merged_by_type)) {
        if (Array.isArray(v)) out.push(...v)
      }
      return out
    }
  }
  return []
}

/**
 * 搜索网盘资源并构建影视墙数据。
 * @param {string} query 关键词
 * @param {object} opts  res / src / channels / plugins / cloud_types / conc / refresh
 *   - refresh=true 时强制实时抓取（覆盖缓存），后端会扇出到全部频道/插件，
 *     耗时可能长达数十秒，因此超时更宽。
 * @returns {Promise<{library:object[], raw:object[], total:number}>}
 */
export async function search(query, opts = {}) {
  const base = getBase() || DEFAULT_BASE
  const refresh = !!opts.refresh
  const params = new URLSearchParams()
  params.set('kw', query)
  // 注意：res=merge 在部分部署下会返回空，res=results 覆盖 Telegram + 插件，最稳。
  params.set('res', opts.res || 'results')
  params.set('src', opts.src || 'all')
  if (opts.channels) params.set('channels', opts.channels)
  if (opts.plugins) params.set('plugins', opts.plugins)
  if (opts.cloud_types) params.set('cloud_types', opts.cloud_types)
  if (opts.conc) params.set('conc', opts.conc)
  params.set('refresh', refresh ? '1' : '0')

  const url = `${base}/api/search?${params.toString()}`
  const ctrl = new AbortController()
  // 实时抓取可能耗时数十秒，放宽超时；普通缓存查询 25s 足矣。
  const timeout = refresh ? 75000 : 25000
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw new Error(refresh ? '实时抓取超时（后端抓取较慢），可稍后重试' : '请求超时，请稍后重试')
    }
    throw new Error('网络错误，无法连接搜索服务')
  }
  clearTimeout(timer)

  if (!res.ok) throw new Error(`搜索请求失败（HTTP ${res.status}）`)

  let json
  try {
    json = await res.json()
  } catch (e) {
    throw new Error('返回结果不是合法 JSON')
  }

  const results = extractResults(json)
  const library = buildLibrary(results)
  return { library, raw: results, total: results.length }
}
