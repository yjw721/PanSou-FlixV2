/**
 * 本地收藏 / 浏览历史。
 * 全部落在 localStorage，无后端依赖；跨标签页通过 storage 事件同步。
 */
import { ref, computed } from 'vue'

const FAV_KEY = 'panflix_fav_v1'
const HIS_KEY = 'panflix_his_v1'
const HIS_MAX = 80
const FAV_MAX = 500

function load(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch (e) {
    return []
  }
}

function persist(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (e) {
    // 配额溢出：裁掉一半再试一次，实在不行就放弃（不影响本次会话使用）
    try {
      localStorage.setItem(key, JSON.stringify(val.slice(0, Math.ceil(val.length / 2))))
    } catch (e2) {
      /* ignore */
    }
  }
}

/**
 * 精简快照：只保留卡片与详情渲染需要的字段。
 * 原始媒体项带着 variants（可能上百条原文），直接存会瞬间撑爆 localStorage。
 */
export function snapshot(m) {
  return {
    key: m.key || m.id,
    id: m.id,
    title: m.title,
    year: m.year || null,
    poster: m.poster || null,
    images: (m.images || []).slice(0, 3),
    resolution: m.resolution || null,
    episode: m.episode || null,
    quality: (m.quality || []).slice(0, 6),
    langs: (m.langs || []).slice(0, 3),
    subs: (m.subs || []).slice(0, 2),
    size: m.size || null,
    region: m.region || '',
    category: (m.category || []).slice(0, 4),
    tags: (m.tags || []).slice(0, 6),
    overview: (m.overview || '').slice(0, 280),
    director: (m.director || []).slice(0, 4),
    actors: (m.actors || []).slice(0, 10),
    channels: (m.channels || []).slice(0, 6),
    datetime: m.datetime || null,
    sources: m.sources || 1,
    score: m.score || 0,
    links: (m.links || []).slice(0, 24).map((l) => ({
      type: l.type,
      url: l.url,
      password: l.password || '',
    })),
  }
}

export const favorites = ref(load(FAV_KEY))
export const history = ref(load(HIS_KEY))

const favSet = computed(() => new Set(favorites.value.map((x) => x.key)))

export function isFav(key) {
  return !!key && favSet.value.has(key)
}

/** 切换收藏，返回切换后的状态（true = 已收藏） */
export function toggleFav(m) {
  const key = m.key || m.id
  if (!key) return false
  if (favSet.value.has(key)) {
    favorites.value = favorites.value.filter((x) => x.key !== key)
    persist(FAV_KEY, favorites.value)
    return false
  }
  const snap = snapshot(m)
  snap.addedAt = Date.now()
  favorites.value = [snap, ...favorites.value].slice(0, FAV_MAX)
  persist(FAV_KEY, favorites.value)
  return true
}

export function removeFav(key) {
  favorites.value = favorites.value.filter((x) => x.key !== key)
  persist(FAV_KEY, favorites.value)
}

export function clearFavs() {
  favorites.value = []
  persist(FAV_KEY, favorites.value)
}

/** 记录一次浏览（打开详情 / 播放时调用），同一作品去重并置顶 */
export function pushHistory(m) {
  const key = m.key || m.id
  if (!key) return
  const snap = snapshot(m)
  snap.viewedAt = Date.now()
  history.value = [snap, ...history.value.filter((x) => x.key !== key)].slice(0, HIS_MAX)
  persist(HIS_KEY, history.value)
}

export function removeHistory(key) {
  history.value = history.value.filter((x) => x.key !== key)
  persist(HIS_KEY, history.value)
}

export function clearHistory() {
  history.value = []
  persist(HIS_KEY, history.value)
}

/* 多标签页同步 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === FAV_KEY) favorites.value = load(FAV_KEY)
    if (e.key === HIS_KEY) history.value = load(HIS_KEY)
  })
}
