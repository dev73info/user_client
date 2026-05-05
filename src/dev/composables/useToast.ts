import 'element-plus/es/components/message/style/css'
import { ElMessage } from 'element-plus'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export function useToast(defaultDuration = 2600) {
  const toastVisible = ref(false)
  const toastMessage = ref('')
  const toastType = ref<ToastType>('info')

  function hideToast() {
    toastVisible.value = false
  }

  function showToast(message: string, type: ToastType = 'info', duration = defaultDuration) {
    toastMessage.value = message
    toastType.value = type
    toastVisible.value = true
    ElMessage({
      message,
      type,
      duration,
    })
  }

  return {
    toastVisible,
    toastMessage,
    toastType,
    showToast,
    hideToast,
  }
}
