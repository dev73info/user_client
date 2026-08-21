import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type DownloadTaskState = {
  active: boolean
  percent: number
  fileName: string
  /** 下载中的文件大小（字节），用于显示更友好的信息 */
  totalBytes: number
  loadedBytes: number
}

/**
 * 全局资源下载进度状态。
 *
 * 设计目标：下载请求挂载在全局 store 上，切换路由（SPA 内部跳转）时
 * 下载不会中断，进度条仍可通过 App.vue 的全局浮层展示。
 */
export const useDownloadStore = defineStore('download', () => {
  const state = ref<DownloadTaskState>({
    active: false,
    percent: 0,
    fileName: '',
    totalBytes: 0,
    loadedBytes: 0,
  })

  const active = computed(() => state.value.active)
  const percent = computed(() => state.value.percent)
  const fileName = computed(() => state.value.fileName)
  const totalBytes = computed(() => state.value.totalBytes)
  const loadedBytes = computed(() => state.value.loadedBytes)

  /** 格式化字节数为可读文本（如 12.4 MB） */
  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return ''
    }
    if (bytes < 1024) {
      return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  /** 开始下载 */
  function start(fileName: string, totalBytes = 0) {
    state.value = {
      active: true,
      percent: 0,
      fileName,
      totalBytes,
      loadedBytes: 0,
    }
  }

  /** 更新进度 */
  function progress(percent: number, loadedBytes = 0, totalBytes?: number) {
    if (!state.value.active) {
      return
    }
    state.value.percent = Math.min(100, Math.max(0, Math.round(percent)))
    state.value.loadedBytes = loadedBytes
    if (typeof totalBytes === 'number' && totalBytes > 0) {
      state.value.totalBytes = totalBytes
    }
  }

  /** 下载完成（成功或失败） */
  function finish() {
    state.value = {
      active: false,
      percent: 100,
      fileName: state.value.fileName,
      totalBytes: state.value.totalBytes,
      loadedBytes: state.value.totalBytes,
    }
  }

  /** 重置到初始状态 */
  function reset() {
    state.value = {
      active: false,
      percent: 0,
      fileName: '',
      totalBytes: 0,
      loadedBytes: 0,
    }
  }

  return {
    state,
    active,
    percent,
    fileName,
    totalBytes,
    loadedBytes,
    formatBytes,
    start,
    progress,
    finish,
    reset,
  }
})
