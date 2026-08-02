<script setup>
import { computed } from 'vue'
import { DISK_META, mediaKind, hasPlayable } from '../lib/parse.js'
import { isFav } from '../lib/store.js'
import PosterImage from './PosterImage.vue'

const props = defineProps({
  media: { type: Object, required: true },
  view: { type: String, default: 'wall' },
})
const emit = defineEmits(['select', 'play', 'fav'])

const m = computed(() => props.media)
const kind = computed(() => mediaKind(m.value))
const faved = computed(() => isFav(m.value.key || m.value.id))
const playable = computed(() => hasPlayable(m.value))

const cloudTypes = computed(() => {
  const set = new Map()
  for (const l of m.value.links || []) {
    if (!set.has(l.type)) set.set(l.type, DISK_META[l.type]?.name || l.type)
  }
  return [...set.entries()]
})

const hlQualities = computed(() =>
  (m.value.quality || []).filter((q) => ['蓝光', 'HDR', '杜比视界', 'REMUX', '枪版'].includes(q)),
)

function open() {
  emit('select', m.value)
}
function onPlay(e) {
  e.stopPropagation()
  emit('play', m.value)
}
function onFav(e) {
  e.stopPropagation()
  emit('fav', m.value)
}
</script>

<template>
  <article
    class="card"
    :class="[view === 'list' ? 'list' : 'wall']"
    tabindex="0"
    role="button"
    :aria-label="m.title"
    @click="open"
    @keydown.enter.prevent="open"
  >
    <!-- 海报 -->
    <div class="poster">
      <PosterImage
        :src="m.poster"
        :fallbacks="m.images"
        :title="m.title"
        :kind="kind"
        :show-label="view !== 'list'"
      />

      <!-- 收藏 -->
      <button
        class="fav"
        :class="{ on: faved }"
        :title="faved ? '取消收藏' : '收藏'"
        :aria-label="faved ? '取消收藏' : '收藏'"
        @click="onFav"
      >
        <svg viewBox="0 0 24 24" width="15" height="15">
          <path
            :fill="faved ? 'currentColor' : 'none'"
            stroke="currentColor"
            stroke-width="2"
            d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13Z"
          />
        </svg>
      </button>

      <!-- 来源数 -->
      <div class="src-badge" v-if="m.sources > 1">
        <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h10v-3c0-.97.39-1.81.99-2.5A12.6 12.6 0 0 0 8 13Zm8 0c-.34 0-.67 0-1 .03A5.5 5.5 0 0 1 17 17v3h6v-3c0-2.66-5.33-4-7-4Z"/></svg>
        {{ m.sources }}
      </div>

      <!-- 播放（桌面悬停显示；触屏走详情页大按钮） -->
      <button
        v-if="playable && view === 'wall'"
        class="play"
        title="打开网盘在线播放"
        aria-label="播放"
        @click="onPlay"
      >
        <svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5.14v13.72L19 12 8 5.14Z"/></svg>
      </button>

      <!-- 底部信息浮层 -->
      <div class="overlay" v-if="view === 'wall'">
        <h3 class="title" :title="m.title">{{ m.title }}</h3>
        <div class="metaline" v-if="m.year || m.resolution || m.episode">
          <span class="badge res" v-if="m.resolution">{{ m.resolution.label }}</span>
          <span class="badge ep" v-if="m.episode">{{ m.episode.label }}</span>
          <span class="badge" v-if="m.year">{{ m.year }}</span>
        </div>
        <div class="clouds" v-if="cloudTypes.length">
          <span
            v-for="[t, name] in cloudTypes.slice(0, 4)"
            :key="t"
            class="cdot"
            :style="{ background: DISK_META[t]?.color }"
            :title="name"
          />
          <span v-if="cloudTypes.length > 4" class="cmore">+{{ cloudTypes.length - 4 }}</span>
        </div>
      </div>
    </div>

    <!-- 列表模式：右侧信息 -->
    <div class="listinfo" v-if="view === 'list'">
      <div class="lt">
        <h3 class="title" :title="m.title">{{ m.title }}</h3>
        <div class="lmetaline">
          <span class="badge res" v-if="m.resolution">{{ m.resolution.label }}</span>
          <span class="badge ep" v-if="m.episode">{{ m.episode.label }}</span>
          <span class="badge" v-if="m.year">{{ m.year }}</span>
          <span class="badge hdr" v-for="q in hlQualities" :key="q">{{ q }}</span>
        </div>
      </div>
      <div class="lmeta">
        <span v-if="m.region">{{ m.region }}</span>
        <span v-if="m.size">{{ m.size }}</span>
        <span class="src">{{ m.sources }} 来源 · {{ m.links.length }} 链接</span>
      </div>
    </div>

    <!-- 列表模式操作区 -->
    <div class="lact" v-if="view === 'list'">
      <button v-if="playable" class="lplay" @click="onPlay">播放</button>
    </div>
  </article>
</template>

<style scoped>
.card {
  position: relative;
  cursor: pointer;
  outline: none;
  border-radius: var(--r-md);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  background: var(--bg-2);
}
.card:focus-visible {
  box-shadow: 0 0 0 2px var(--accent);
}

/* ---- 影视墙卡片 ---- */
.card.wall {
  overflow: hidden;
}
.card.wall .poster {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--bg-3);
  box-shadow: var(--shadow-card);
}
.card.wall:hover {
  transform: translateY(-6px);
  box-shadow: var(--shadow-pop);
}
.card.wall:hover :deep(.pi-img) {
  transform: scale(1.06);
}

.src-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 2;
}

/* 收藏按钮 */
.fav {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  opacity: 0;
  transform: scale(0.9);
  transition: opacity 0.15s, transform 0.15s, color 0.15s;
}
.card:hover .fav,
.card:focus-within .fav {
  opacity: 1;
  transform: scale(1);
}
.fav.on {
  opacity: 1;
  transform: scale(1);
  color: #ff5d7a;
}
.fav:hover {
  background: rgba(0, 0, 0, 0.75);
}

/* 播放按钮 */
.play {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  width: 52px;
  height: 52px;
  margin: -26px 0 0 -26px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(59, 130, 246, 0.9);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
  opacity: 0;
  transform: scale(0.8);
  transition: opacity 0.18s, transform 0.18s, filter 0.15s;
}
.card.wall:hover .play {
  opacity: 1;
  transform: scale(1);
}
.play:hover {
  filter: brightness(1.12);
}
.play svg {
  margin-left: 3px;
}

.overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 28px 12px 12px;
  background: linear-gradient(to top, rgba(7, 8, 12, 0.96) 25%, rgba(7, 8, 12, 0.6) 60%, transparent);
  z-index: 1;
}
.title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: #fff;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.metaline {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}
.clouds {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}
.cdot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.cmore {
  font-size: 11px;
  color: var(--text-3);
  margin-left: 2px;
}
.card.wall:hover .overlay {
  padding-bottom: 14px;
}

/* ---- 列表模式 ---- */
.card.list {
  display: flex;
  gap: 12px;
  padding: 10px;
  align-items: center;
}
.card.list .poster {
  position: relative;
  width: 66px;
  height: 99px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--bg-3);
  box-shadow: var(--shadow-card);
}
.card.list:hover {
  background: var(--bg-hover);
}
.card.list .title {
  color: var(--text-1);
  font-size: 15px;
  -webkit-line-clamp: 1;
  line-clamp: 1;
}
.card.list .fav {
  width: 24px;
  height: 24px;
  top: 3px;
  left: 3px;
}
.listinfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lmetaline {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.lmeta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12.5px;
  color: var(--text-3);
}
.lmeta .src {
  color: var(--accent);
}
.lact {
  flex-shrink: 0;
}
.lplay {
  padding: 8px 16px;
  border-radius: var(--r-pill);
  background: rgba(59, 130, 246, 0.16);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #cfe0ff;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s;
}
.lplay:hover {
  background: rgba(59, 130, 246, 0.3);
}

/* ---- 触屏：没有 hover，常驻显示关键操作 ---- */
@media (hover: none) {
  .card .fav {
    opacity: 1;
    transform: scale(1);
  }
  .card.wall:hover {
    transform: none;
    box-shadow: var(--shadow-card);
  }
  .play {
    display: none;
  }
}

@media (max-width: 640px) {
  .title {
    font-size: 12.5px;
  }
  .overlay {
    padding: 22px 8px 8px;
  }
  .metaline {
    gap: 4px;
    margin-top: 5px;
  }
  .clouds {
    margin-top: 6px;
  }
  .cdot {
    width: 7px;
    height: 7px;
  }
  .fav {
    width: 26px;
    height: 26px;
  }
  .card.list {
    gap: 10px;
    padding: 8px;
  }
  .card.list .poster {
    width: 54px;
    height: 81px;
  }
  .card.list .title {
    font-size: 14px;
  }
  .lmeta {
    gap: 8px;
    font-size: 11.5px;
  }
  .lplay {
    padding: 7px 12px;
    font-size: 12px;
  }
}
</style>
