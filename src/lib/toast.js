import { ref } from 'vue'

export const toastMsg = ref('')
let timer = null

export function showToast(msg, ms = 1900) {
  toastMsg.value = msg
  clearTimeout(timer)
  timer = setTimeout(() => (toastMsg.value = ''), ms)
}

/** 复制文本（优先 Clipboard API，降级到 execCommand） */
export async function copyText(text, label = '内容') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    showToast(`已复制${label}`)
    return true
  } catch (e) {
    showToast('复制失败，请手动复制')
    return false
  }
}
