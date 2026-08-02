// 本地 bridge 后端客户端（AList + PotPlayer 桥接）。
// 默认指向同机 8787；可用 VITE_BRIDGE_BASE 覆盖（如部署到同一台机器的其他端口）。
const BASE = (import.meta.env.VITE_BRIDGE_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '')

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let data = {}
  try {
    data = await res.json()
  } catch (e) {
    /* 空响应 */
  }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`)
  return data
}

export const bridge = {
  available() {
    return call('GET', '/api/alist/status').then(() => true).catch(() => false)
  },
  status: () => call('GET', '/api/alist/status'),
  configureAList: (cfg) => call('POST', '/api/alist/configure', cfg),
  potplayerPath: () => call('GET', '/api/potplayer/path'),
  setPotplayerPath: (p) => call('POST', '/api/potplayer/path', { path: p }),
  listAccounts: () => call('GET', '/api/accounts'),
  addAccount: (a) => call('POST', '/api/accounts', a),
  removeAccount: (pid) => call('DELETE', `/api/accounts/${pid}`),
  qrStart: (pid) => call('POST', '/api/accounts/qr/start', { provider: pid }),
  qrPoll: (pid, poll, name) =>
    call('POST', '/api/accounts/qr/poll', { provider: pid, poll, name }),
  resolve: (provider, url, pwd) =>
    call('POST', '/api/play/resolve', { provider, url, pwd }),
  play: (url) => call('POST', '/api/potplayer/play', { url }),

  /* 一键解析并拉起 PotPlayer：先向 bridge 要直链，再让其拉起本地播放器 */
  async playShare(link) {
    const r = await this.resolve(link.type, link.url, link.password || '')
    await this.play(r.raw_url)
    return r
  },
}
