<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  loading: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
})
const emit = defineEmits(['search', 'update:modelValue', 'open-settings'])

const q = ref(props.modelValue)
watch(() => props.modelValue, (v) => { if (v !== q.value) q.value = v })

function submit() {
  const v = q.value.trim()
  if (!v || props.loading) return
  emit('search', v)
}
</script>

<template>
  <div class="searchbar">
    <form class="box" @submit.prevent="submit">
      <svg class="ico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14Z"
        />
      </svg>
      <input
        v-model="q"
        type="search"
        class="inp"
        placeholder="搜电影 / 剧集 / 综艺，例如：三体、奥本海默…"
        autocomplete="off"
        @update:modelValue="emit('update:modelValue', $event)"
      />
      <button class="go" type="submit" :disabled="loading">
        <span v-if="loading" class="spin" />
        <span v-else>搜索</span>
      </button>
    </form>
    <button class="gear" title="API 设置" @click="emit('open-settings')">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M19.14 12.94a7.49 7.49 0 0 0 .05-.94 7.49 7.49 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.03.31-.05.62-.05.94s.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 15.5 12 3.5 3.5 0 0 1 12 15.5Z"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.searchbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
.box {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-pill);
  padding: 0 6px 0 14px;
  height: 44px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.box:focus-within {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}
.ico {
  color: var(--text-3);
  flex-shrink: 0;
}
.inp {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  color: var(--text-1);
  font-size: 15px;
}
.inp::placeholder {
  color: var(--text-4);
}
.inp::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
.go {
  flex-shrink: 0;
  height: 34px;
  padding: 0 18px;
  border-radius: var(--r-pill);
  background: var(--accent-grad);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: filter 0.15s, transform 0.1s;
}
.go:hover:not(:disabled) {
  filter: brightness(1.08);
}
.go:active:not(:disabled) {
  transform: scale(0.97);
}
.go:disabled {
  opacity: 0.7;
  cursor: default;
}
.spin {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: rot 0.7s linear infinite;
}
@keyframes rot {
  to { transform: rotate(360deg); }
}
.gear {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: var(--r-pill);
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}
.gear:hover {
  color: var(--text-1);
  border-color: var(--border-strong);
}
</style>
