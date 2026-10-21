import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Ref } from 'vue'

/**
 * 全屏看板的开关：从 `views/DevHomeView.vue` 抽出来的「进 / 出全屏」这一层。
 *
 * 它只管三件事——`fullscreenchange` 的监听与状态同步、`toggleFullscreen` 的收发、看板时钟。
 * **进入全屏之后要做什么不归它管**：连 WebSocket、拉首帧快照（`onEnter`）与断开（`onLeave`）
 * 都由视图接回去。这三件事原先写在同一个 `watch(isFullscreen)` 里，顺序是「时钟起 → 进看板」，
 * 拆开时保持这个顺序，别让连接晚于时钟起或者反过来。
 *
 * 全屏主体（根节点 `ref`）留在视图：`requestFullscreen` 必须打在壳上，这里只读它不建它。
 */

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export type UseFullscreenOptions = {
  /** 全屏主体：视图的根节点。 */
  target: Ref<HTMLElement | null>
  /** 刚进入全屏：连实时看板（时钟已先起，见文件头）。 */
  onEnter?: () => void
  /** 刚退出全屏：断开实时看板。 */
  onLeave?: () => void
  /** 浏览器拒绝进入全屏时给提示；文案留在视图，这里不引 TMessage。 */
  onDenied?: () => void
}

export function useFullscreen(options: UseFullscreenOptions) {
  /** iPadOS Safari 只认带 webkit 前缀的那套，两套都探一次。 */
  const fullscreenSupported =
    typeof document !== 'undefined' &&
    Boolean(
      document.documentElement.requestFullscreen ||
      (document.documentElement as WebkitFullscreenElement).webkitRequestFullscreen,
    )

  const isFullscreen = ref(false)

  function currentFullscreenElement(): Element | null {
    const doc = document as WebkitFullscreenDocument
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  }

  function syncFullscreenState() {
    isFullscreen.value = currentFullscreenElement() != null
  }

  async function toggleFullscreen() {
    const doc = document as WebkitFullscreenDocument
    const root = options.target.value as WebkitFullscreenElement | null
    if (!root) return
    try {
      if (currentFullscreenElement()) {
        await (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.())
      } else {
        await (root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen?.())
      }
    } catch {
      options.onDenied?.()
    }
  }

  /** 看板上的时钟：每秒走一次，只在全屏时计时。 */
  const now = ref(Date.now())
  let clockTimer: ReturnType<typeof setInterval> | null = null

  function stopClock() {
    if (clockTimer != null) {
      clearInterval(clockTimer)
      clockTimer = null
    }
  }

  function startClock() {
    now.value = Date.now()
    stopClock()
    clockTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }

  watch(isFullscreen, (on) => {
    if (on) {
      startClock()
      options.onEnter?.()
    } else {
      stopClock()
      options.onLeave?.()
    }
  })

  onMounted(() => {
    document.addEventListener('fullscreenchange', syncFullscreenState)
    document.addEventListener('webkitfullscreenchange', syncFullscreenState)
    syncFullscreenState()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', syncFullscreenState)
    document.removeEventListener('webkitfullscreenchange', syncFullscreenState)
    stopClock()
    // 全屏是为这块看板开的，离开总览页就退出，免得别的菜单页也被困在全屏里
    // （先摘监听再退出：退全屏会派发 fullscreenchange，不该再回头惊动一次 watcher）
    if (currentFullscreenElement()) {
      const doc = document as WebkitFullscreenDocument
      Promise.resolve(
        doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.(),
      ).catch(() => {})
    }
  })

  return { isFullscreen, fullscreenSupported, toggleFullscreen, now }
}
