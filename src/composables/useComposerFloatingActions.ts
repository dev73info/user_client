import { computed, nextTick, onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'

/** 浮动提交条要摸的三块 DOM（面板 / 占位壳 / 动作条）。 */
export type ComposerPanelRefName = 'panel' | 'shell' | 'actions'

/**
 * 发帖面板的**浮动提交条**：把提交按钮在面板滚出视口时钉在页面底部。
 *
 * 从 `views/CommunityView.vue` 整块搬来（同一次搬迁里没有拆散它），四件事必须在一起：
 * `ResizeObserver`（只观察内容面板）、window 上的 `scroll`（capture）与 `resize`、
 * `getBoundingClientRect` 量出来的滞回判定、两个写进 `:style` 的结果（占位壳高度与固定定位样式）。
 *
 * ## 生命周期的两条硬约定
 *
 * 1. 监听在 `onMounted` 注册，**连 ResizeObserver 一起在 `onScopeDispose` 里断开**。
 *    改造前这段收尾写在视图的 `onBeforeUnmount` 里；composable 里拿不到那个时机，
 *    跟着宿主组件的 effect scope 释放才是等价的。漏掉它就是滚动监听泄漏。
 * 2. `watch(visible)` → `nextTick(observeComposerActions)`：面板是 `v-if` 出来的，
 *    DOM 要到下一个 tick 才在，顺序不能改。
 *
 * 为什么单独一个 composable 而不是塞进 `useCommunityComposer`：那边已经装了表单、实名门禁与提交，
 * 两份合起来超过 `.ts` 的 300 行预算；这里只碰 DOM、不认识帖子也不认识 api，切开边界很干净。
 */
export function useComposerFloatingActions(visible: Ref<boolean>) {
  const composerPanelRef = ref<HTMLElement | null>(null)
  const composerActionsShellRef = ref<HTMLElement | null>(null)
  const composerActionsRef = ref<HTMLElement | null>(null)
  const composerActionsFloating = ref(false)
  const composerActionsPlaceholderHeight = ref(0)
  const composerActionsFloatingStyle = ref<Record<string, string>>({})
  let composerActionsResizeObserver: ResizeObserver | null = null

  /** 占位壳要跟动作条等高，飘起来时才不会把下面的正文顶上去。 */
  const composerActionsShellStyle = computed<Record<string, string> | undefined>(() => {
    if (!composerActionsFloating.value || composerActionsPlaceholderHeight.value <= 0) {
      return undefined
    }

    return {
      height: `${composerActionsPlaceholderHeight.value}px`,
    }
  })

  /**
   * 模板 ref 的桥：三块 DOM 长在 `CommunityComposerPanel.vue` 里，父级拿不到它们的 ref，
   * 所以由面板把回调传下来（`:ref="(el) => setRef('panel', el)"`）。
   */
  function setComposerRef(
    name: ComposerPanelRefName,
    el: Element | ComponentPublicInstance | null,
  ) {
    const target =
      name === 'panel'
        ? composerPanelRef
        : name === 'shell'
          ? composerActionsShellRef
          : composerActionsRef
    target.value = (el as HTMLElement | null) ?? null
  }

  function resetFloatingComposerActions() {
    composerActionsFloating.value = false
    composerActionsPlaceholderHeight.value = 0
    composerActionsFloatingStyle.value = {}
  }

  function updateFloatingComposerActions() {
    const panel = composerPanelRef.value
    const shell = composerActionsShellRef.value
    const actions = composerActionsRef.value
    if (!visible.value || !panel || !shell || !actions) {
      resetFloatingComposerActions()
      return
    }

    const panelRect = panel.getBoundingClientRect()
    const shellRect = shell.getBoundingClientRect()
    const actionsHeight = actions.offsetHeight
    const viewportGap = 12
    const bottom = 16
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight
    const floatingTop = viewportHeight - bottom - actionsHeight
    const floats = panelRect.top < floatingTop
    const coversBottom = panelRect.bottom > viewportHeight - bottom + actionsHeight + viewportGap

    // 滞回（hysteresis）：进入/退出漂浮采用不同的判定阈值，避免在临界处反复切换导致闪烁。
    let canFloat
    if (composerActionsFloating.value) {
      canFloat = floats && panelRect.bottom > viewportHeight - bottom + actionsHeight + 4
    } else {
      canFloat = floats && coversBottom
    }

    composerActionsPlaceholderHeight.value = actionsHeight
    composerActionsFloating.value = canFloat

    if (!canFloat) {
      composerActionsFloatingStyle.value = {}
      return
    }

    const left = Math.max(viewportGap, Math.round(shellRect.left))
    const width = Math.max(
      180,
      Math.min(Math.round(shellRect.width), window.innerWidth - left - viewportGap),
    )
    composerActionsFloatingStyle.value = {
      bottom: `${bottom}px`,
      left: `${left}px`,
      width: `${width}px`,
    }
  }

  function observeComposerActions() {
    composerActionsResizeObserver?.disconnect()
    composerActionsResizeObserver = null

    // 仅观察内容面板，不观察 shell/操作按钮（它们会随漂浮状态改变，形成反馈循环导致闪烁）。
    if (typeof ResizeObserver !== 'undefined' && visible.value) {
      composerActionsResizeObserver = new ResizeObserver(updateFloatingComposerActions)
      if (composerPanelRef.value) {
        composerActionsResizeObserver.observe(composerPanelRef.value)
      }
    }

    updateFloatingComposerActions()
  }

  onMounted(() => {
    window.addEventListener('scroll', updateFloatingComposerActions, true)
    window.addEventListener('resize', updateFloatingComposerActions)
  })

  onScopeDispose(() => {
    composerActionsResizeObserver?.disconnect()
    composerActionsResizeObserver = null
    window.removeEventListener('scroll', updateFloatingComposerActions, true)
    window.removeEventListener('resize', updateFloatingComposerActions)
  })

  watch(visible, () => {
    void nextTick(observeComposerActions)
  })

  return {
    composerActionsShellStyle,
    composerActionsFloating,
    composerActionsFloatingStyle,
    setComposerRef,
  }
}
