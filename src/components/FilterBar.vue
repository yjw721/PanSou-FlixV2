<script setup>
import { computed } from 'vue'
import { DISK_ORDER, DISK_META, mediaKind, FILTER_QUALITIES } from '../lib/parse.js'

const props = defineProps({
  library: { type: Array, default: () => [] },
  filters: { type: Object, required: true },
  sort: { type: String, default: 'score' },
  view: { type: String, default: 'wall' },
})
const emit = defineEmits(['update:filters', 'update:sort', 'update:view'])

const KIND_TABS = [
  { key: 'all', label: '全部' },
  { key: 'movie', label: '电影' },
  { key: 'series', label: '剧集' },
  { key: 'show', label: '综艺' },
]

const SORTS = [
  { key: 'score', label: '推荐' },
  { key: 'year', label: '年份' },
  { key: 'sources', label: '来源数' },
  { key: 'res', label: '清晰度' },
  { key: 'recent', label: '更新时间' },
]

/* 统计各类型数量 */
const kindCounts = computed(() => {
  const c = { all: props.library.length, movie: 0, series: 0, show: 0 }
  for (const m of props.library) c[mediaKind(m)]++
  return c
})

/* 库里实际存在的网盘类型，按固定顺序 */
const availableClouds = computed(() => {
  const set = new Set()
  for (const m of props.library) for (const l of m.links) set.add(l.type)
  return DISK_ORDER.filter((t) => set.has(t))
})

/* 库里实际出现的画质维度 */
const availableQualities = computed(() => {
  const set = new Set()
  for (const m of props.library) {
    if (m.resolution) set.add(m.resolution.label)
    for (const q of m.quality || []) set.add(q)
  }
  return FILTER_QUALITIES.filter((q) => set.has(q))
})

function setKind(k) {
  emit('update:filters', { ...props.filters, kind: k })
}
function toggleCloud(t) {
  const cur = props.filters.clouds || []
  const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
  emit('update:filters', { ...props.filters, clouds: next })
}
function toggleQuality(q) {
  const cur = props.filters.qualities || []
  const next = cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q]
  emit('update:filters', { ...props.filters, qualities: next })
}
function togglePoster() {
  emit('update:filters', { ...props.filters, onlyPoster: !props.filters.onlyPoster })
}
</script>

<template>
  <div class="filterbar">
    <div class="row top">
      <div class="kinds">
        <button
          v-for="k in KIND_TABS"
          :key="k.key"
          class="kind"
          :class="{ on: filters.kind === k.key }"
          @click="setKind(k.key)"
        >
          {{ k.label }}
          <span class="cnt">{{ kindCounts[k.key] }}</span>
        </button>
      </div>

      <div class="right">
        <label class="poster-toggle" :class="{ on: filters.onlyPoster }">
          <input type="checkbox" :checked="filters.onlyPoster" @change="togglePoster" />
          <span>仅看有海报</span>
        </label>

        <div class="viewswitch">
          <button :class="{ on: view === 'wall' }" title="影视墙" @click="emit('update:view', 'wall')">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z"/></svg>
          </button>
          <button :class="{ on: view === 'list' }" title="列表" @click="emit('update:view', 'list')">
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 5h18v3H3V5Zm0 6h18v3H3v-3Zm0 6h18v3H3v-3Z"/></svg>
          </button>
        </div>

        <div class="sortsel">
          <select :value="sort" @change="emit('update:sort', $event.target.value)">
            <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
          </select>
        </div>
      </div>
    </div>

    <div class="row chips" v-if="availableClouds.length || availableQualities.length">
      <span class="grp-label">网盘</span>
      <button
        v-for="t in availableClouds"
        :key="t"
        class="chip"
        :class="{ 'is-active': (filters.clouds || []).includes(t) }"
        @click="toggleCloud(t)"
      >
        <span class="dot" :style="{ background: DISK_META[t]?.color }" />
        {{ DISK_META[t]?.name || t }}
      </button>

      <span class="grp-label sep">画质</span>
      <button
        v-for="q in availableQualities"
        :key="q"
        class="chip"
        :class="{ 'is-active': (filters.qualities || []).includes(q) }"
        @click="toggleQuality(q)"
      >
        {{ q }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.filterbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.row.top {
  flex-wrap: wrap;
  justify-content: space-between;
}
.kinds {
  display: flex;
  gap: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: 4px;
}
.kind {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: var(--r-pill);
  font-size: 14px;
  color: var(--text-2);
  transition: all 0.15s;
}
.kind:hover {
  color: var(--text-1);
}
.kind.on {
  background: var(--accent-grad);
  color: #fff;
  font-weight: 600;
}
.kind .cnt {
  font-size: 11px;
  opacity: 0.75;
  background: rgba(0, 0, 0, 0.25);
  padding: 1px 7px;
  border-radius: 99px;
}
.kind.on .cnt {
  background: rgba(0, 0, 0, 0.25);
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.poster-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}
.poster-toggle input {
  display: none;
}
.poster-toggle span {
  padding: 6px 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-2);
  transition: all 0.15s;
}
.poster-toggle.on span {
  border-color: rgba(59, 130, 246, 0.5);
  background: rgba(59, 130, 246, 0.16);
  color: #cfe0ff;
}

.viewswitch {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  overflow: hidden;
}
.viewswitch button {
  width: 38px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  background: var(--bg-2);
  transition: all 0.15s;
}
.viewswitch button.on {
  color: #fff;
  background: var(--bg-hover);
}
.viewswitch button:hover {
  color: var(--text-1);
}

.sortsel select {
  height: 36px;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-1);
  font-size: 13px;
  outline: none;
  cursor: pointer;
}
.sortsel select:focus {
  border-color: rgba(59, 130, 246, 0.5);
}

.chips {
  flex-wrap: wrap;
  align-items: center;
}
.grp-label {
  font-size: 12px;
  color: var(--text-4);
  margin-right: 2px;
}
.grp-label.sep {
  margin-left: 10px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ---- 移动端 ---- */
@media (max-width: 720px) {
  .filterbar {
    gap: 10px;
    padding: 12px 0 2px;
  }
  .row.top {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  /* 分类 tab 横向滚动，避免换行挤压 */
  .kinds {
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .kinds::-webkit-scrollbar {
    display: none;
  }
  .kind {
    flex-shrink: 0;
    padding: 7px 13px;
    font-size: 13px;
  }
  .right {
    justify-content: space-between;
    gap: 8px;
  }
  .poster-toggle {
    font-size: 12.5px;
  }
  .poster-toggle span {
    padding: 6px 10px;
  }
  .sortsel select,
  .viewswitch button {
    height: 34px;
  }
  .viewswitch button {
    width: 36px;
  }
  /* 网盘 / 画质 chips 横向滚动，一行到底 */
  .chips {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chips > * {
    flex-shrink: 0;
  }
}
</style>
