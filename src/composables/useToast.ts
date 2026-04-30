import { onUnmounted, ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

const toastVisible = ref(false)
const toastMessage = ref('')
const toastType = ref<ToastType>('info')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function clearToastTimer() {
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = null
  }
}

function hideToast() {
  toastVisible.value = false
  clearToastTimer()
}

export function useToast(defaultDuration = 2600) {
  function showToast(message: string, type: ToastType = 'info', duration = defaultDuration) {
    toastMessage.value = message
    toastType.value = type
    toastVisible.value = true

    clearToastTimer()
    toastTimer = setTimeout(() => {
      hideToast()
    }, duration)
  }

  onUnmounted(() => {
    clearToastTimer()
  })

  return {
    toastVisible,
    toastMessage,
    toastType,
    showToast,
    hideToast,
  }
}
