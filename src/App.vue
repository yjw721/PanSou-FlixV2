<script setup>
import { ref, computed, watch } from 'vue'
import SearchBar from './components/SearchBar.vue'
import FilterBar from './components/FilterBar.vue'
import PosterWall from './components/PosterWall.vue'
import DetailDrawer from './components/DetailDrawer.vue'
import PosterImage from './components/PosterImage.vue'
import AccountPanel from './components/AccountPanel.vue'
import { search, health, setBase, getBaseUrl } from './lib/api.js'
import { mediaKind, pickPlayable, DISK_META } from './lib/parse.js'
import { favorites, history, toggleFav, pushHistory, clearHistory } from './lib/store.js'
import { toastMsg, showToast } from './lib/toast.js'
import { bridge } from './lib/bridge.js'

const query = ref('')
const library = ref([])
const loading = ref(false)
const error = ref('')
const searched = ref(false)
const selected = ref(null)

const tab = ref('search') // search | fav | history
const filters = ref({ kind: 'all', clouds: [], qualities: [], onlyPoster: false })
const sort = ref('score')
const view = ref('wall')
const forceRefresh = ref(false)

const settingsOpen = ref(false)
const accountsOpen = ref(false)
const apiBaseInput = ref(getBaseUrl())
const healthState = ref('idle') // idle | checking | ok | fail

const SUGGESTIONS = ['三体', '奥本海默', '漫长的季节', '庆余年', '鬼灭之刃', '甄嬛传', '周处除三害']

/* 当前标签页对应的数据源 */
const activeLibrary = computed(() => {
  if (tab.value === 'fav') return favorites.value
  if (tab.value === 'history') return history.value
  return library.value
})

const filtered = computed(() => {
  let arr = activeLibrary.value
  const f = filters.value
  if (f.kind !== 'all') arr = arr.filter((m) => mediaKind(m) === f.kind)
  if (f.clouds && f.clouds.length)
    arr = arr.filter((m) => (m.links || []).some((l) => f.clouds.includes(l.type)))
  if (f.qualities && f.qualities.length) {
    arr = arr.filter(
      (m) =>
        (m.resolution && f.qualities.includes(m.resolution.label)) ||
        (m.quality || []).some((q) => f.qualities.includes(q)),
    )
  }
  if (f.onlyPoster) arr = arr.filter((m) => m.poster)

  const out = [...arr]
  // 收藏 / 历史默认保持「最近在前」，除非用户主动改了排序
  if (tab.value !== 'search' && sort.value === 'score') return out

  switch (sort.value) {
    case 'year':
      out.sort((a, b) => (b.year || 0) - (a.year || 0))
      break
    case 'sources':
      out.sort((a, b) => b.sources - a.sources)
      break
    case 'res':
      out.sort((a, b) => (b.resolution?.rank || 0) - (a.resolution?.rank || 0))
      break
    case 'recent':
      out.sort((a, b) => (b.datetime || '').localeCompare(a.datetime || ''))
      break
    default:
      out.sort((a, b) => (b.score || 0) - (a.score || 0))
  }
  return out
})

/* 切标签时重置筛选，避免上个标签的条件把结果筛空 */
watch(tab, () => {
  filters.value = { kind: 'all', clouds: [], qualities: [], onlyPoster: false }
  sort.value = 'score'
})

async function doSearch(q) {
  if (!q) return
  tab.value = 'search'
  query.value = q
  loading.value = true
  error.value = ''
  searched.value = true
  selected.value = null
  try {
    const { library: lib } = await search(q, {
      res: 'results',
      src: 'all',
      refresh: forceRefresh.value,
    })
    library.value = lib
  } catch (e) {
    library.value = []
    error.value = e.message || '搜索失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function onSelect(m) {
  selected.value = m
  pushHistory(m)
}

async function onPlay(m) {
  const link = pickPlayable(m.links)
  if (!link) {
    showToast('该资源只有磁力/电驴链接，无法在线播放')
    return
  }
  pushHistory(m)
  const name = DISK_META[link.type]?.name || '网盘'
  try {
    // 优先走本地 bridge：解析直链并拉起 PotPlayer（AList + 已登录网盘）
    await bridge.playShare(link)
    showToast(
      link.password
        ? `已调用 PotPlayer 播放${name}，提取码 ${link.password}`
        : `已调用 PotPlayer 播放${name}`,
    )
  } catch (e) {
    // 兜底：bridge 未启动 / AList 未配置 / 解析失败 → 退回打开分享页
    window.open(link.url, '_blank', 'noopener,noreferrer')
    showToast(`PotPlayer 拉起失败：${e.message}；已退回打开分享页`)
  }
}

function onFav(m) {
  const now = toggleFav(m)
  showToast(now ? '已加入收藏' : '已取消收藏')
}

function onClearHistory() {
  clearHistory()
  showToast('已清空浏览记录')
}

function goHome() {
  tab.value = 'search'
  searched.value = false
  error.value = ''
  query.value = ''
  library.value = []
}

async function saveSettings() {
  setBase(apiBaseInput.value)
  healthState.value = 'idle'
  settingsOpen.value = false
}

async function checkHealth() {
  healthState.value = 'checking'
  try {
    const ok = await health(apiBaseInput.value.trim().replace(/\/+$/, '') || undefined)
    healthState.value = ok ? 'ok' : 'fail'
  } catch (e) {
    healthState.value = 'fail'
  }
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <button class="brand" @click="goHome" title="回到首页">
        <span class="logo">🎬</span>
        <span class="word">Pan<span class="gradient-text">Flix</span></span>
      </button>

      <SearchBar
        class="sb"
        v-model="query"
        :loading="loading"
        @search="doSearch"
        @open-settings="settingsOpen = true"
      />

      <nav class="tabs">
        <button class="tab" :class="{ on: tab === 'search' }" @click="tab = 'search'">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"/></svg>
          <span class="tl">搜索</span>
        </button>
        <button class="tab" :class="{ on: tab === 'fav' }" @click="tab = 'fav'">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"/></svg>
          <span class="tl">收藏</span>
          <span v-if="favorites.length" class="tn">{{ favorites.length }}</span>
        </button>
        <button class="tab" :class="{ on: tab === 'history' }" @click="tab = 'history'">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M13 3a9 9 0 1 0 8.94 10h-2.02A7 7 0 1 1 13 5a6.94 6.94 0 0 1 4.9 2.1L15 10h7V3l-2.6 2.6A8.96 8.96 0 0 0 13 3Zm-1 5v5.4l4.3 2.55.75-1.26L13.5 12.6V8H12Z"/></svg>
          <span class="tl">历史</span>
          <span v-if="history.length" class="tn">{{ history.length }}</span>
        </button>
        <button class="tab acc-btn" :class="{ on: accountsOpen }" @click="accountsOpen = true" title="网盘账号 / AList / PotPlayer">
          <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5Z"/></svg>
          <span class="tl">账号</span>
        </button>
      </nav>
    </header>

    <main class="container">
      <!-- 落地欢迎页 -->
      <section v-if="tab === 'search' && !searched && !loading" class="landing">
        <h1 class="hero-title">网盘影视，<span class="gradient-text">一眼成墙</span></h1>
        <p class="hero-sub">
          聚合夸克 / 阿里 / 百度 / 迅雷等网盘资源，自动清洗混乱标题、归并同款，
          以 Emby 式海报墙呈现。
        </p>
        <div class="sugs">
          <button v-for="s in SUGGESTIONS" :key="s" class="sug" @click="doSearch(s)">
            {{ s }}
          </button>
        </div>
        <label class="fr-toggle">
          <input type="checkbox" v-model="forceRefresh" />
          <span>实时抓取（覆盖缓存，首次可能需数十秒）</span>
        </label>

        <!-- 最近浏览 -->
        <section v-if="history.length" class="recent">
          <div class="recent-head">
            <h2>最近浏览</h2>
            <button class="more" @click="tab = 'history'">查看全部 →</button>
          </div>
          <div class="recent-row">
            <button
              v-for="h in history.slice(0, 14)"
              :key="h.key"
              class="rcard"
              :title="h.title"
              @click="onSelect(h)"
            >
              <span class="rposter">
                <PosterImage
                  :src="h.poster"
                  :fallbacks="h.images"
                  :title="h.title"
                  :kind="mediaKind(h)"
                  :show-label="false"
                />
              </span>
              <span class="rtitle">{{ h.title }}</span>
            </button>
          </div>
        </section>
      </section>

      <template v-else>
        <div class="result-head">
          <div class="rh-left">
            <template v-if="tab === 'search'">
              <span v-if="searched && !loading" class="q">“{{ query }}”</span>
              <span v-if="!loading && filtered.length" class="rc">{{ filtered.length }} 部作品</span>
            </template>
            <template v-else-if="tab === 'fav'">
              <span class="q">我的收藏</span>
              <span v-if="filtered.length" class="rc">{{ filtered.length }} 部作品</span>
            </template>
            <template v-else>
              <span class="q">浏览历史</span>
              <span v-if="filtered.length" class="rc">{{ filtered.length }} 条记录</span>
            </template>
          </div>

          <label v-if="tab === 'search'" class="fr-toggle inline" :class="{ on: forceRefresh }">
            <input type="checkbox" v-model="forceRefresh" />
            <span>实时抓取</span>
          </label>
          <button v-else-if="tab === 'history' && history.length" class="clear" @click="onClearHistory">
            清空历史
          </button>
        </div>

        <FilterBar
          v-if="activeLibrary.length"
          :library="activeLibrary"
          v-model:filters="filters"
          v-model:sort="sort"
          v-model:view="view"
        />

        <div v-if="tab === 'search' && error" class="state error">
          <div class="state-ico">⚠️</div>
          <p>{{ error }}</p>
          <button class="retry" @click="doSearch(query)">重试</button>
        </div>

        <div v-else-if="tab === 'search' && searched && !loading && !library.length" class="state">
          <div class="state-ico">🈳</div>
          <p>未找到「{{ query }}」的相关资源。</p>
          <p v-if="!forceRefresh" class="hint">可开启右上角「实时抓取」强制后端重新检索。</p>
          <button v-else class="retry" @click="doSearch(query)">重新抓取</button>
        </div>

        <div v-else-if="tab === 'fav' && !favorites.length" class="state">
          <div class="state-ico">🤍</div>
          <p>还没有收藏任何作品。</p>
          <p class="hint">在海报左上角点 ♥ 即可收藏，数据保存在本地浏览器。</p>
          <button class="retry" @click="tab = 'search'">去找片</button>
        </div>

        <div v-else-if="tab === 'history' && !history.length" class="state">
          <div class="state-ico">🕘</div>
          <p>暂无浏览记录。</p>
          <p class="hint">打开任意作品详情后会自动记录在这里。</p>
          <button class="retry" @click="tab = 'search'">去找片</button>
        </div>

        <div v-else-if="!filtered.length && activeLibrary.length" class="state">
          <div class="state-ico">🔍</div>
          <p>当前筛选条件下没有匹配的作品。</p>
          <button class="retry" @click="filters = { kind: 'all', clouds: [], qualities: [], onlyPoster: false }">
            重置筛选
          </button>
        </div>

        <PosterWall
          v-else
          :items="filtered"
          :view="view"
          :loading="loading"
          @select="onSelect"
          @play="onPlay"
          @fav="onFav"
        />
      </template>
    </main>

    <footer class="foot">
      数据来自第三方网盘搜索聚合，仅供学习交流 · PanFlix 非官方前端
    </footer>

    <DetailDrawer
      :media="selected"
      @close="selected = null"
      @play="onPlay"
      @fav="onFav"
    />

    <!-- 全局 toast -->
    <Teleport to="body">
      <Transition name="toast">
        <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
      </Transition>
    </Teleport>

    <!-- 设置弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="settingsOpen" class="modal-scrim" @click.self="settingsOpen = false">
          <div class="modal">
            <h3>API 设置</h3>
            <p class="desc">配置搜索后端地址。接口需支持跨域（Access-Control-Allow-Origin: *）方可直连。</p>
            <label class="lbl">API 基址</label>
            <input
              v-model="apiBaseInput"
              class="inp"
              placeholder="https://so.252035.xyz"
              spellcheck="false"
            />
            <div class="health-row">
              <button class="test" @click="checkHealth">测试连通性</button>
              <span v-if="healthState === 'checking'" class="hs">检测中…</span>
              <span v-else-if="healthState === 'ok'" class="hs ok">✓ 可连接</span>
              <span v-else-if="healthState === 'fail'" class="hs bad">✗ 无法连接</span>
            </div>
            <div class="modal-actions">
              <button class="cancel" @click="settingsOpen = false">取消</button>
              <button class="save" @click="saveSettings">保存</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 网盘账号 / AList / PotPlayer 面板 -->
    <Teleport to="body">
      <Transition name="fade">
        <AccountPanel v-if="accountsOpen" @close="accountsOpen = false" />
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 50;
  min-height: var(--topbar-h);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 22px;
  background: rgba(11, 13, 18, 0.82);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--border);
  padding-top: env(safe-area-inset-top);
}
.brand {
  order: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  padding: 0;
}
.logo {
  font-size: 22px;
}
.word {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.3px;
}
.sb {
  order: 2;
}

/* 标签导航 */
.tabs {
  order: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: 4px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border-radius: var(--r-pill);
  font-size: 13.5px;
  color: var(--text-3);
  transition: all 0.15s;
}
.tab:hover {
  color: var(--text-1);
}
.tab.on {
  background: var(--bg-hover);
  color: #fff;
  font-weight: 600;
}
.tn {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 99px;
  background: rgba(59, 130, 246, 0.25);
  color: #cfe0ff;
}

.container {
  flex: 1;
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 0 22px 30px;
}

.landing {
  max-width: 900px;
  margin: 8vh auto 0;
  text-align: center;
}
.hero-title {
  font-size: 44px;
  font-weight: 800;
  margin: 0 0 18px;
  line-height: 1.2;
}
.hero-sub {
  font-size: 16px;
  line-height: 1.8;
  color: var(--text-2);
  margin: 0 auto 34px;
  max-width: 600px;
}
.sugs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.sug {
  padding: 9px 18px;
  border-radius: var(--r-pill);
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 14px;
  transition: all 0.15s;
}
.sug:hover {
  color: var(--text-1);
  border-color: var(--border-strong);
  transform: translateY(-2px);
}

/* 最近浏览 */
.recent {
  margin-top: 52px;
  text-align: left;
}
.recent-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.recent-head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.more {
  font-size: 13px;
  color: var(--text-3);
}
.more:hover {
  color: var(--accent);
}
.recent-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  scrollbar-width: thin;
}
.rcard {
  flex-shrink: 0;
  width: 92px;
  padding: 0;
  text-align: left;
}
.rposter {
  position: relative;
  display: block;
  width: 92px;
  height: 138px;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--bg-3);
  box-shadow: var(--shadow-card);
  transition: transform 0.15s;
}
.rcard:hover .rposter {
  transform: translateY(-4px);
}
.rtitle {
  display: block;
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--text-2);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 0 4px;
}
.rh-left {
  display: flex;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.fr-toggle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 22px;
  font-size: 13px;
  color: var(--text-3);
  cursor: pointer;
  user-select: none;
}
.fr-toggle input {
  width: 15px;
  height: 15px;
  accent-color: var(--accent);
  cursor: pointer;
}
.fr-toggle.inline {
  margin-top: 0;
  padding: 7px 13px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-2);
  transition: all 0.15s;
  flex-shrink: 0;
}
.fr-toggle.inline.on {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.16);
  color: #cfe0ff;
}
.clear {
  flex-shrink: 0;
  padding: 7px 14px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-3);
  font-size: 13px;
  transition: all 0.15s;
}
.clear:hover {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.4);
}
.q {
  font-size: 20px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc {
  font-size: 13px;
  color: var(--text-3);
  flex-shrink: 0;
}

.state {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-3);
}
.state.error {
  color: var(--text-2);
}
.state-ico {
  font-size: 48px;
  margin-bottom: 16px;
}
.state p {
  font-size: 15px;
  margin: 0 0 18px;
}
.state .hint {
  font-size: 13px;
  color: var(--text-4);
  margin: 0 0 18px;
}
.retry {
  padding: 9px 22px;
  border-radius: var(--r-pill);
  background: var(--accent-grad);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}

.foot {
  text-align: center;
  padding: 24px;
  font-size: 12px;
  color: var(--text-4);
  border-top: 1px solid var(--border);
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

/* toast */
.toast {
  position: fixed;
  bottom: calc(40px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100vw - 40px);
  background: rgba(20, 22, 28, 0.96);
  border: 1px solid var(--border-strong);
  color: #fff;
  padding: 10px 20px;
  border-radius: var(--r-pill);
  font-size: 13.5px;
  text-align: center;
  z-index: 1500;
  box-shadow: var(--shadow-pop);
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 10px);
}

/* 设置弹窗 */
.modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(4, 5, 8, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal {
  width: min(440px, 100%);
  background: var(--bg-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-lg);
  padding: 24px;
  box-shadow: var(--shadow-pop);
}
.modal h3 {
  margin: 0 0 6px;
  font-size: 18px;
}
.desc {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-3);
}
.lbl {
  display: block;
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 7px;
}
.inp {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--bg-1);
  border: 1px solid var(--border);
  color: var(--text-1);
  font-size: 14px;
  outline: none;
}
.inp:focus {
  border-color: rgba(59, 130, 246, 0.5);
}
.health-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0 22px;
}
.test {
  padding: 8px 16px;
  border-radius: var(--r-md);
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text-1);
  font-size: 13px;
}
.test:hover {
  border-color: var(--border-strong);
}
.hs {
  font-size: 13px;
  color: var(--text-3);
}
.hs.ok {
  color: var(--ok);
}
.hs.bad {
  color: var(--danger);
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.cancel,
.save {
  padding: 9px 20px;
  border-radius: var(--r-md);
  font-size: 14px;
  font-weight: 600;
}
.cancel {
  background: var(--bg-3);
  color: var(--text-2);
}
.cancel:hover {
  color: var(--text-1);
}
.save {
  background: var(--accent-grad);
  color: #fff;
}

.acc-btn {
  order: 4;
  margin-left: 2px;
}

/* ==================== 移动端 ==================== */
@media (max-width: 860px) {
  .topbar {
    flex-wrap: wrap;
    gap: 10px;
    padding: 10px 14px;
    padding-top: calc(10px + env(safe-area-inset-top));
  }
  .brand {
    order: 1;
  }
  .tabs {
    order: 2;
    margin-left: auto;
  }
  .sb {
    order: 3;
    flex-basis: 100%;
  }
  .tab {
    padding: 0 11px;
    gap: 5px;
  }
  .container {
    padding: 0 14px 24px;
  }
}

@media (max-width: 640px) {
  .word {
    font-size: 17px;
  }
  .logo {
    font-size: 19px;
  }
  /* 标签只留图标 + 数字，给搜索框腾地方 */
  .tl {
    display: none;
  }
  .tab {
    padding: 0 10px;
    height: 32px;
  }
  .landing {
    margin-top: 5vh;
  }
  .hero-title {
    font-size: 28px;
    margin-bottom: 12px;
  }
  .hero-sub {
    font-size: 14px;
    line-height: 1.7;
    margin-bottom: 24px;
  }
  .sug {
    padding: 8px 14px;
    font-size: 13px;
  }
  .sugs {
    gap: 8px;
  }
  .fr-toggle {
    font-size: 12px;
    margin-top: 18px;
  }
  .recent {
    margin-top: 36px;
  }
  .rcard,
  .rposter {
    width: 78px;
  }
  .rposter {
    height: 117px;
  }
  .result-head {
    padding: 14px 0 2px;
  }
  .q {
    font-size: 17px;
  }
  .state {
    padding: 56px 16px;
  }
  .state-ico {
    font-size: 40px;
  }
  .state p {
    font-size: 14px;
  }
  .modal {
    padding: 20px;
  }
}
</style>
