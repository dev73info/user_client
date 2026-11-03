import { ref } from 'vue'

/**
 * 工作台中栏宽度（消息中心的会话列表 / 分组导航）：两处共用同一个 CSS 变量、同一份本机存储
 * 与同一个模块级宽度值（见下方 `paneWidth`），拖过一边另一边当场跟着变。
 *
 * 各自的可用上下限仍由各自组件决定（消息中心要留给会话区，分组导航最窄由菜单文字决定）。
 */
export const WORKBENCH_PANE_WIDTH_STORAGE_KEY = '73info:workbench:pane-width'

/** 两处都读这一支：`grid-template-columns: ... var(--uw-pane-width) ...` */
export const WORKBENCH_PANE_WIDTH_CSS_VAR = '--uw-pane-width'

/** 读本机宽度；没有存过或存储不可用时返回 null，由调用方用各自的默认值。 */
export function readWorkbenchPaneWidth(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = Number(window.localStorage.getItem(WORKBENCH_PANE_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  } catch {
    return null
  }
}

/** 存宽度：只是界面偏好，存储失败（无痕模式 / 禁用 localStorage）不影响本次拖拽。 */
export function writeWorkbenchPaneWidth(width: number): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(WORKBENCH_PANE_WIDTH_STORAGE_KEY, String(Math.round(width)))
  } catch {
    // 忽略：宽度偏好存不下就退回默认宽度。
  }
}

/**
 * 共用的宽度值（模块级单例）：消息中心与分组导航在同一个 SPA 里来回切页，
 * 读取/写入都走这一支，拖过一边另一边当场跟着变，不需要重新挂载。
 *
 * 这里存的是**未按上下限夹取**的原始宽度：两侧的可拖范围不同（消息中心要留给会话区，
 * 分组导航最窄由菜单文字决定），各自读取时按自己的范围夹取即可。
 */
const paneWidth = ref<number | null>(readWorkbenchPaneWidth())

export function useWorkbenchPaneWidth() {
  return {
    paneWidth,
    /** 写入共用宽度并落到本机存储 */
    persistPaneWidth(width: number) {
      paneWidth.value = Math.round(width)
      writeWorkbenchPaneWidth(width)
    },
  }
}
