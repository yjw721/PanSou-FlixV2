<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { DISK_ORDER, DISK_META, mediaKind, pickPlayable } from '../lib/parse.js'
import { isFav } from '../lib/store.js'
import { copyText } from '../lib/toast.js'
import PosterImage from './PosterImage.vue'

const props = defineProps({
  media: { type: Object, default: null },
})
const emit = defineEmits(['close', 'play', 'fav'])

const m = computed(() => props.media)
const open = computed(() => !!props.media)
const kind = computed(() => (m.value ? mediaKind(m.value) : 'movie'))
const faved = computed(() => (m.value ? isFav(m.value.key || m.value.id) : false))
const playLink = computed(() => (m.value ? pickPlayable(m.value.links) : null))

const KIND_LABEL = { movie: '电影', series: '剧集', show: '综艺' }

const groupedLinks = computed(() => {
  if (!m.value) return []
  const byType = new Map()
  for (const l of m.value.links || []) {
    if (!byType.has(l.type)) byType.set(l.type, [])
    byType.get(l.type).push(l)
  }
  return DISK_ORDER.filter((t) => byType.has(t)).map((t) => ({
    type: t,
    meta: DISK_META[t],
    links: byType.get(t),
  }))
})

const hlQualities = computed(() =>
  ((m.value && m.value.quality) || []).filter((q) =>
    ['蓝光', 'HDR', '杜比视界', 'REMUX', '枪版'].includes(q),
  ),
)

function copyLink(link) {
  const text = link.password ? `${link.url} 提取码:${link.password}` : link.url
  copyText(text, '链接')
}

function openLink(link) {
  window.open(link.url, '_blank', 'noopener,noreferrer')
}

function onKey(e) {
  if (e.key === 'Escape' && open.value) emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

watch(open, (v) => {
  document.body.style.overflow = v ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="scrim" @click.self="emit('close')">
        <aside class="drawer" role="dialog" aria-modal="true">
          <div class="grab" />
          <button class="close" @click="emit('close')" aria-label="关闭">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M18.3 5.71 12 12.01 5.7 5.71 4.29 7.12 10.59 13.4 4.29 19.7l1.41 1.41L12 14.82l6.3 6.29 1.41-1.41L13.41 13.4l6.3-6.29z"/></svg>
          </button>

          <template v-if="m">
            <!-- 头图 -->
            <div class="hero">
              <div
                class="hero-bg"
                :style="m.poster ? { backgroundImage: `url(${m.poster})` } : {}"
              />
              <div class="hero-grad" />
              <div class="hero-row">
                <div class="hero-poster">
                  <PosterImage
                    :src="m.poster"
                    :fallbacks="m.images"
                    :title="m.title"
                    :kind="kind"
                  />
                </div>
                <div class="hero-meta">
                  <h2 class="name">{{ m.title }}</h2>
                  <div class="tags">
                    <span class="badge" v-if="m.year">{{ m.year }}</span>
                    <span class="badge res" v-if="m.resolution">{{ m.resolution.label }}</span>
                    <span class="badge ep" v-if="m.episode">{{ m.episode.label }}</span>
                    <span class="badge hdr" v-for="q in hlQualities" :key="q">{{ q }}</span>
                    <span class="badge lang" v-for="l in (m.langs || [])" :key="l">{{ l }}</span>
                    <span class="badge" v-if="m.subs && m.subs.length">{{ m.subs[0] }}</span>
                  </div>
                  <div class="sub" v-if="m.region || m.size || m.category?.length">
                    <span v-if="m.region">{{ m.region }}</span>
                    <span v-if="m.category?.length">{{ m.category.join('/') }}</span>
                    <span v-if="m.size">{{ m.size }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="body">
              <!-- 主操作 -->
              <div class="actions">
                <button
                  class="act play"
                  :disabled="!playLink"
                  :title="playLink ? `在 ${DISK_META[playLink.type]?.name || '网盘'} 打开` : '该资源仅有磁力/电驴链接，无法在线播放'"
                  @click="emit('play', m)"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M8 5.14v13.72L19 12 8 5.14Z"/></svg>
                  <span>{{ playLink ? '立即播放' : '无法在线播放' }}</span>
                </button>
                <button class="act fav" :class="{ on: faved }" @click="emit('fav', m)">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      :fill="faved ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="2"
                      d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"
                    />
                  </svg>
                  <span>{{ faved ? '已收藏' : '收藏' }}</span>
                </button>
                <button
                  v-if="playLink"
                  class="act ghost"
                  @click="copyLink(playLink)"
                >
                  <svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1Zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Zm0 16H8V7h11v14Z"/></svg>
                  <span>复制链接</span>
                </button>
              </div>

              <p class="kind-line">
                <span class="klabel">{{ KIND_LABEL[kind] || '作品' }}</span>
                <span class="dot-sep">·</span>
                <span>{{ m.sources }} 个来源</span>
                <span class="dot-sep">·</span>
                <span>{{ m.links.length }} 条网盘链接</span>
              </p>

              <p v-if="m.overview" class="overview">{{ m.overview }}</p>

              <div class="credits" v-if="m.director?.length || m.actors?.length">
                <div v-if="m.director?.length" class="credit">
                  <span class="cl">导演</span><span class="cv">{{ m.director.join('、') }}</span>
                </div>
                <div v-if="m.actors?.length" class="credit">
                  <span class="cl">主演</span><span class="cv">{{ m.actors.slice(0, 12).join('、') }}</span>
                </div>
              </div>

              <!-- 网盘链接 -->
              <section class="links">
                <h3 class="sec-title">网盘资源</h3>
                <div v-for="g in groupedLinks" :key="g.type" class="lgroup">
                  <div class="ghead">
                    <span class="gdot" :style="{ background: g.meta?.color }" />
                    <span class="gname">{{ g.meta?.name || g.type }}</span>
                    <span class="gcount">{{ g.links.length }}</span>
                  </div>
                  <ul class="llist">
                    <li v-for="(l, i) in g.links" :key="i" class="litem">
                      <a
                        class="lurl"
                        :href="l.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        @click.stop
                      >{{ l.url.replace(/^https?:\/\//, '') }}</a>
                      <span v-if="l.password" class="lpw">码:{{ l.password }}</span>
                      <button class="lgo" title="打开" @click="openLink(l)">
                        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7ZM5 5h5V3H3v18h18v-7h-2v5H5V5Z"/></svg>
                      </button>
                      <button class="lcopy" @click="copyLink(l)">复制</button>
                    </li>
                  </ul>
                </div>
              </section>

              <p v-if="m.channels?.length" class="channels">
                来源频道：{{ m.channels.slice(0, 8).join('、') }}<span v-if="m.channels.length > 8"> 等</span>
              </p>
            </div>
          </template>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(4, 5, 8, 0.55);
  backdrop-filter: blur(8px);
  display: flex;
  justify-content: flex-end;
}
.drawer {
  position: relative;
  width: min(560px, 100%);
  height: 100%;
  background: var(--bg-1);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-pop);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
.grab {
  display: none;
}
.close {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 5;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  transition: background 0.15s;
}
.close:hover {
  background: rgba(0, 0, 0, 0.75);
}

.hero {
  position: relative;
  min-height: 280px;
  padding: 80px 24px 24px;
  background-color: var(--bg-3);
  overflow: hidden;
}
.hero-bg {
  position: absolute;
  inset: -20px;
  background-size: cover;
  background-position: center 20%;
  filter: blur(18px) saturate(1.15);
  transform: scale(1.08);
  opacity: 0.75;
}
.hero-grad {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--bg-1) 6%, rgba(11, 13, 18, 0.62) 45%, rgba(11, 13, 18, 0.3) 100%);
}
.hero-row {
  position: relative;
  display: flex;
  gap: 18px;
  align-items: flex-end;
}
.hero-poster {
  position: relative;
  width: 130px;
  height: 195px;
  flex-shrink: 0;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  background: var(--bg-3);
}
.hero-meta {
  flex: 1;
  min-width: 0;
  padding-bottom: 4px;
}
.name {
  margin: 0 0 12px;
  font-size: 24px;
  font-weight: 800;
  line-height: 1.25;
  color: #fff;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sub {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-2);
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
}

.body {
  padding: 20px 24px 60px;
}

/* 主操作 */
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}
.act {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 42px;
  padding: 0 20px;
  border-radius: var(--r-pill);
  font-size: 14px;
  font-weight: 600;
  transition: all 0.15s;
}
.act.play {
  background: var(--accent-grad);
  color: #fff;
  flex: 1;
  min-width: 150px;
  justify-content: center;
}
.act.play:hover:not(:disabled) {
  filter: brightness(1.1);
}
.act.play:disabled {
  background: var(--bg-3);
  color: var(--text-4);
  cursor: not-allowed;
}
.act.fav {
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.act.fav:hover {
  border-color: var(--border-strong);
  color: var(--text-1);
}
.act.fav.on {
  color: #ff5d7a;
  border-color: rgba(255, 93, 122, 0.45);
  background: rgba(255, 93, 122, 0.12);
}
.act.ghost {
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
}
.act.ghost:hover {
  border-color: var(--border-strong);
  color: var(--text-1);
}

.kind-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--text-3);
}
.klabel {
  color: var(--accent);
  font-weight: 600;
}
.dot-sep {
  color: var(--text-4);
}
.overview {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-2);
}
.credits {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 22px;
}
.credit {
  display: flex;
  gap: 12px;
  font-size: 13.5px;
}
.cl {
  flex-shrink: 0;
  width: 36px;
  color: var(--text-4);
}
.cv {
  color: var(--text-2);
  line-height: 1.6;
}

.sec-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
}
.lgroup {
  margin-bottom: 18px;
}
.ghead {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.gdot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.gname {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}
.gcount {
  font-size: 12px;
  color: var(--text-4);
  background: var(--bg-2);
  padding: 1px 8px;
  border-radius: 99px;
}
.llist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.litem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  transition: border-color 0.15s;
}
.litem:hover {
  border-color: var(--border-strong);
}
.lurl {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lurl:hover {
  color: var(--accent);
}
.lpw {
  font-size: 12px;
  color: var(--warn);
  flex-shrink: 0;
}
.lgo {
  flex-shrink: 0;
  width: 28px;
  height: 26px;
  border-radius: var(--r-sm);
  color: var(--text-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, background 0.15s;
}
.lgo:hover {
  color: var(--text-1);
  background: var(--bg-3);
}
.lcopy {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: var(--r-pill);
  background: rgba(59, 130, 246, 0.15);
  color: #cfe0ff;
  font-size: 12.5px;
  font-weight: 600;
  transition: background 0.15s;
}
.lcopy:hover {
  background: rgba(59, 130, 246, 0.3);
}

.channels {
  margin-top: 18px;
  font-size: 12.5px;
  color: var(--text-4);
  line-height: 1.6;
}

/* 过渡：桌面右侧抽屉 */
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}
.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}

/* ---- 移动端：改成底部弹出的 bottom sheet ---- */
@media (max-width: 720px) {
  .scrim {
    align-items: flex-end;
    justify-content: center;
  }
  .drawer {
    width: 100%;
    height: 92vh;
    height: 92dvh;
    border-left: none;
    border-top: 1px solid var(--border-strong);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  .grab {
    display: block;
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 4px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.32);
    z-index: 6;
  }
  .close {
    top: 18px;
    right: 12px;
    width: 34px;
    height: 34px;
  }
  .hero {
    min-height: 220px;
    padding: 56px 16px 18px;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
  .hero-poster {
    width: 96px;
    height: 144px;
  }
  .hero-row {
    gap: 14px;
  }
  .name {
    font-size: 19px;
    margin-bottom: 9px;
  }
  .sub {
    margin-top: 9px;
    font-size: 12px;
    gap: 8px;
  }
  .body {
    padding: 16px 16px 48px;
  }
  .act {
    height: 44px;
  }
  .act.play {
    min-width: 100%;
  }
  .act.fav,
  .act.ghost {
    flex: 1;
    justify-content: center;
    padding: 0 12px;
  }
  .lurl {
    font-size: 12px;
  }
  .litem {
    padding: 9px 10px;
    gap: 6px;
  }

  .drawer-enter-from .drawer,
  .drawer-leave-to .drawer {
    transform: translateY(100%);
  }
}
</style>
