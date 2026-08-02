<script setup>
import { ref, computed, watch, onBeforeUnmount, onMounted } from 'vue'
import MediaCard from './MediaCard.vue'

const props = defineProps({
  items: { type: Array, default: () => [] },
  view: { type: String, default: 'wall' },
  loading: { type: Boolean, default: false },
})
const emit = defineEmits(['select', 'play', 'fav'])

const PAGE = 48
const STEP = 36
const visible = ref(PAGE)
const sentinel = ref(null)
let io = null

const shown = computed(() => props.items.slice(0, visible.value))
const hasMore = computed(() => visible.value < props.items.length)

/* 数据变化（新搜索 / 筛选 / 切标签）时重置计数 */
watch(
  () => [props.items, props.view],
  () => {
    visible.value = PAGE
  },
)

onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && hasMore.value && !props.loading) {
        visible.value = Math.min(visible.value + STEP, props.items.length)
      }
    },
    { rootMargin: '600px 0px' },
  )
  if (sentinel.value) io.observe(sentinel.value)
})
onBeforeUnmount(() => io && io.disconnect())
</script>

<template>
  <!-- 骨架屏 -->
  <div v-if="loading && items.length === 0" class="wall" :class="view">
    <div v-for="n in 24" :key="n" class="skel" :class="view">
      <div class="skel-poster skeleton" />
      <div v-if="view === 'list'" class="skel-lines">
        <div class="skel-line skeleton" />
        <div class="skel-line short skeleton" />
      </div>
    </div>
  </div>

  <!-- 影视墙 / 列表 -->
  <div v-else class="wall" :class="view">
    <MediaCard
      v-for="m in shown"
      :key="m.key || m.id"
      :media="m"
      :view="view"
      @select="emit('select', $event)"
      @play="emit('play', $event)"
      @fav="emit('fav', $event)"
    />
    <div ref="sentinel" class="sentinel" />
    <p v-if="!hasMore && items.length" class="end">— 已展示全部 {{ items.length }} 部作品 —</p>
  </div>
</template>

<style scoped>
.wall {
  display: grid;
  gap: 16px;
  padding: 8px 0 40px;
}
.wall.wall {
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}
.wall.list {
  grid-template-columns: 1fr;
  gap: 10px;
}

.sentinel {
  grid-column: 1 / -1;
  height: 1px;
}
.end {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-4);
  font-size: 13px;
  padding: 16px 0;
}

/* 骨架 */
.skel {
  border-radius: var(--r-md);
}
.skel.wall .skel-poster {
  aspect-ratio: 2 / 3;
  border-radius: var(--r-md);
}
.skel.list {
  display: flex;
  gap: 12px;
  padding: 10px;
}
.skel.list .skel-poster {
  width: 66px;
  height: 99px;
  flex-shrink: 0;
  border-radius: var(--r-sm);
}
.skel-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
}
.skel-line {
  height: 14px;
  border-radius: 6px;
}
.skel-line.short {
  width: 50%;
}

/* ---- 响应式列宽 ---- */
@media (min-width: 1700px) {
  .wall.wall {
    grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  }
}
@media (max-width: 900px) {
  .wall.wall {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 13px;
  }
}
@media (max-width: 640px) {
  .wall.wall {
    grid-template-columns: repeat(auto-fill, minmax(106px, 1fr));
    gap: 10px;
  }
  .wall.list {
    gap: 8px;
  }
  .skel.list .skel-poster {
    width: 54px;
    height: 81px;
  }
}
@media (max-width: 380px) {
  .wall.wall {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
