import { ref } from 'vue'

/**
 * 工作台中栏宽度（消息中心的会话列表 / 分组导航）：两处共用同一个 CSS 变量、同一份本机存储、
 * 同一个模块级宽度值（见下方 `paneWidth`）与同一组上下限，拖过一边另一边当场跟着变，
 * 拖到极端再切页也不会跳宽。
 */
export const WORKBENCH_PANE_WIDTH_STORAGE_KEY = '73info:workbench:pane-width'

/** 两处共用的可拖范围与默认宽度（默认即最窄档；200 让会话标签行刚好贴着中栏右边缘）。 */
export const WORKBENCH_PANE_WIDTH_MIN = 200
export const WORKBENCH_PANE_WIDTH_MAX = 520
export const WORKBENCH_PANE_WIDTH_DEFAULT = 200

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
 * 这里存的是**未按上下限夹取**的原始宽度（消息中心还要按会话区最小宽度再收一次），
 * 两侧读取时用同一组 {@link WORKBENCH_PANE_WIDTH_MIN}–{@link WORKBENCH_PANE_WIDTH_MAX} 夹取。
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
