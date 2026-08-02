<script setup>
/**
 * 统一海报组件。
 * - 骨架屏 → 淡入
 * - 主图失败时按 images 顺序自动回退
 * - 全部失败/无图时生成 SVG 占位图（viewBox 2:3，任意尺寸下都清晰）
 * - referrerpolicy=no-referrer 绕开 Telegram / 站内图床的防盗链
 */
import { computed, ref, watch } from 'vue'
import { titleHue } from '../lib/parse.js'

const props = defineProps({
  src: { type: String, default: '' },
  fallbacks: { type: Array, default: () => [] },
  title: { type: String, default: '' },
  kind: { type: String, default: 'movie' },
  /** 占位图是否显示标题文字（小尺寸场景可关掉） */
  showLabel: { type: Boolean, default: true },
})

const idx = ref(0)
const loaded = ref(false)
const dead = ref(false)

const chain = computed(() => {
  const list = []
  if (props.src) list.push(props.src)
  for (const u of props.fallbacks || []) {
    if (u && typeof u === 'string' && !list.includes(u)) list.push(u)
  }
  return list
})

const current = computed(() => chain.value[idx.value] || '')
const showPlaceholder = computed(() => dead.value || !chain.value.length)

watch(
  () => [props.src, props.fallbacks],
  () => {
    idx.value = 0
    loaded.value = false
    dead.value = false
  },
)

function onError() {
  if (idx.value + 1 < chain.value.length) {
    idx.value += 1
    loaded.value = false
  } else {
    dead.value = true
  }
}

/* ---- 占位图 ---- */
const hue = computed(() => titleHue(props.title))
const initial = computed(() => {
  const t = (props.title || '').trim()
  return t ? t.charAt(0) : '?'
})

/** SVG 不会自动折行，手动切成最多两行 */
const lines = computed(() => {
  const t = (props.title || '').trim()
  if (!t) return []
  const PER = 9
  const a = t.slice(0, PER)
  let b = t.slice(PER, PER * 2)
  if (t.length > PER * 2) b = b.slice(0, PER - 1) + '…'
  return b ? [a, b] : [a]
})

const KIND_PATH = {
  // 胶片
  movie:
    'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 2v2h2V5H6Zm10 0v2h2V5h-2ZM6 9v2h2V9H6Zm10 0v2h2V9h-2ZM6 13v2h2v-2H6Zm10 0v2h2v-2h-2ZM6 17v2h2v-2H6Zm10 0v2h2v-2h-2Zm-6-12v14h4V5h-4Z',
  // 电视
  series: 'M2 6h20v12H2V6Zm2 2v8h16V8H4Zm5-6 3 3 3-3 1.4 1.4L14 5h-4L7.6 3.4 9 2Z',
  // 话筒
  show:
    'M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-6 6.93V21h3v2H8v-2h3v-3.07A7 7 0 0 1 5 11h2a5 5 0 0 0 10 0h2Z',
}
const kindPath = computed(() => KIND_PATH[props.kind] || KIND_PATH.movie)
</script>

<template>
  <div class="pi">
    <img
      v-if="!showPlaceholder"
      :key="current"
      :src="current"
      :alt="title"
      class="pi-img"
      :class="{ loaded }"
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @load="loaded = true"
      @error="onError"
    />
    <div v-if="!showPlaceholder && !loaded" class="pi-skel skeleton" />

    <!-- 占位图：viewBox 与 2:3 海报比例一致，缩放不失真 -->
    <svg
      v-if="showPlaceholder"
      class="pi-ph"
      viewBox="0 0 200 300"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      :aria-label="title || '暂无海报'"
    >
      <defs>
        <linearGradient :id="`g${hue}`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="`hsl(${hue} 44% 26%)`" />
          <stop offset="100%" :stop-color="`hsl(${(hue + 44) % 360} 40% 12%)`" />
        </linearGradient>
        <radialGradient :id="`r${hue}`" cx="0.24" cy="0.06" r="0.9">
          <stop offset="0%" :stop-color="`hsl(${hue} 70% 52%)`" stop-opacity="0.42" />
          <stop offset="100%" :stop-color="`hsl(${hue} 70% 52%)`" stop-opacity="0" />
        </radialGradient>
      </defs>

      <rect width="200" height="300" :fill="`url(#g${hue})`" />
      <rect width="200" height="300" :fill="`url(#r${hue})`" />

      <!-- 背景大首字 -->
      <text
        x="100"
        y="168"
        text-anchor="middle"
        font-size="132"
        font-weight="800"
        fill="#fff"
        fill-opacity="0.12"
        font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
      >{{ initial }}</text>

      <!-- 类型图标 -->
      <g :transform="showLabel ? 'translate(88 96) scale(1)' : 'translate(88 126) scale(1)'">
        <path :d="kindPath" fill="#fff" fill-opacity="0.55" />
      </g>

      <!-- 标题 -->
      <template v-if="showLabel">
        <text
          v-for="(ln, i) in lines"
          :key="i"
          x="100"
          :y="200 + i * 22"
          text-anchor="middle"
          font-size="16"
          font-weight="600"
          fill="#fff"
          fill-opacity="0.86"
          font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
        >{{ ln }}</text>
        <text
          x="100"
          y="262"
          text-anchor="middle"
          font-size="11"
          fill="#fff"
          fill-opacity="0.4"
          font-family="-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
        >暂无海报</text>
      </template>
    </svg>
  </div>
</template>

<style scoped>
.pi {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: var(--bg-3);
}
.pi-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  opacity: 0;
  transition: opacity 0.35s ease, transform 0.4s ease;
}
.pi-img.loaded {
  opacity: 1;
}
.pi-skel {
  position: absolute;
  inset: 0;
}
.pi-ph {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
</style>
