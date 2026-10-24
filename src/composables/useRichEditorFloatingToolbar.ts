import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

/** 把 `floatingToolbarTop` 这类入参收敛成非负整数像素，认不出就返回 null（表示自己算）。 */
export function normalizeCssPixelValue(value: number | string | undefined): number | null {
  if (value === undefined || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null
}

/**
 * 富文本编辑器工具栏的「吸顶悬浮」：滚动时把工具栏钉在视口上方，
 * 并在原位留出等高占位，避免内容跳动。
 *
 * 从 `RichTextEditor.vue` 里整块搬出来，判断口径与数值一律原样保留：
 * 顶到页面头部（`.portal-header`）或所在滚动容器的上沿、左右不超出容器、
 * 下方空间不够时退回原位。滚动监听、`ResizeObserver` 与卸载清理也在这里，
 * 组件只负责提供根元素、工具栏元素与是否启用的开关。
 */
export function useRichEditorFloatingToolbar(options: {
  rootRef: Ref<HTMLElement | null>
  /** 工具栏元素在子组件里，取的时候才问它要——不缓存，避免组件重挂后拿到旧节点。 */
  getToolbarElement: () => HTMLElement | null
  /** 显式指定的吸顶距离（px），为空时按页面头部与滚动容器现算。 */
  toolbarTop: Ref<number | null>
  enabled: Ref<boolean>
}) {
  const { rootRef, getToolbarElement, toolbarTop, enabled } = options

  const floating = ref(false)
  const placeholderHeight = ref(0)
  const floatingStyle = ref<Record<string, string>>({})
  let resizeObserver: ResizeObserver | null = null
  let scrollContainer: HTMLElement | null = null

  const shellStyle = computed<Record<string, string> | undefined>(() => {
    const style: Record<string, string> = {}

    if (enabled.value) {
      style.position = 'sticky'
      style.top = 'var(--rich-text-editor-toolbar-top)'
    }

    if (!floating.value || placeholderHeight.value <= 0) {
      return Object.keys(style).length ? style : undefined
    }

    style.height = `${placeholderHeight.value}px`
    return style
  })

  function isScrollableContainer(element: HTMLElement): boolean {
    const style = getComputedStyle(element)
    return /(auto|scroll|overlay)/.test(style.overflowY)
  }

  function findFloatingScrollContainer(root: HTMLElement): HTMLElement | null {
    let current = root.parentElement
    while (current && current !== document.body) {
      if (isScrollableContainer(current)) {
        return current
      }
      current = current.parentElement
    }

    return null
  }

  function getFloatingToolbarTop(root: HTMLElement): number {
    if (toolbarTop.value !== null) {
      return toolbarTop.value
    }

    const defaultGap = 12
    let top = defaultGap

    const header = document.querySelector<HTMLElement>('.portal-header')
    const headerRect = header?.getBoundingClientRect()
    if (headerRect && headerRect.height > 0 && headerRect.bottom > 0) {
      top = Math.max(top, Math.round(headerRect.bottom + 10))
    }

    const currentScrollContainer = findFloatingScrollContainer(root)
    if (currentScrollContainer) {
      const containerRect = currentScrollContainer.getBoundingClientRect()
      if (containerRect.height > 0 && containerRect.bottom > defaultGap) {
        top = Math.max(top, Math.round(containerRect.top + 10))
      }
    }

    return top
  }

  function getFloatingToolbarHorizontalStyle(
    root: HTMLElement,
  ): Pick<CSSStyleDeclaration, 'left' | 'width'> {
    const rootRect = root.getBoundingClientRect()
    const viewportGap = 12
    const currentScrollContainer = findFloatingScrollContainer(root)
    const containerRect = currentScrollContainer?.getBoundingClientRect()
    const leftLimit = Math.max(viewportGap, Math.round(containerRect?.left ?? viewportGap))
    const rightLimit = Math.min(
      window.innerWidth - viewportGap,
      Math.round(containerRect?.right ?? window.innerWidth - viewportGap),
    )
    const left = Math.max(leftLimit, Math.round(rootRect.left))
    const availableWidth = Math.max(0, rightLimit - left)
    const width = Math.min(Math.round(rootRect.width), availableWidth)

    return {
      left: `${left}px`,
      width: `${width}px`,
    }
  }

  function resetFloatingToolbar() {
    placeholderHeight.value = 0
    floating.value = false
    floatingStyle.value = {}
  }

  function updateFloatingToolbar() {
    const root = rootRef.value
    const toolbar = getToolbarElement()
    if (!root || !toolbar || !enabled.value) {
      resetFloatingToolbar()
      return
    }

    const rootRect = root.getBoundingClientRect()
    const toolbarHeight = toolbar.offsetHeight
    const top = getFloatingToolbarTop(root)
    const currentScrollContainer = findFloatingScrollContainer(root)
    const containerBottom =
      currentScrollContainer?.getBoundingClientRect().bottom ?? window.innerHeight
    const canFloat =
      rootRect.top < top &&
      rootRect.bottom - toolbarHeight - 16 > top &&
      top + toolbarHeight + 8 < containerBottom

    placeholderHeight.value = toolbarHeight
    floating.value = canFloat

    if (!canFloat) {
      floatingStyle.value = {}
      return
    }

    floatingStyle.value = {
      ...getFloatingToolbarHorizontalStyle(root),
      top: `${top}px`,
    }
  }

  function bindFloatingScrollContainer() {
    scrollContainer?.removeEventListener('scroll', updateFloatingToolbar)
    scrollContainer = rootRef.value ? findFloatingScrollContainer(rootRef.value) : null
    scrollContainer?.addEventListener('scroll', updateFloatingToolbar, { passive: true })
  }

  watch(enabled, updateFloatingToolbar)

  onMounted(() => {
    void nextTick(() => {
      bindFloatingScrollContainer()
      updateFloatingToolbar()
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(updateFloatingToolbar)
        if (rootRef.value) {
          resizeObserver.observe(rootRef.value)
        }
        const toolbar = getToolbarElement()
        if (toolbar) {
          resizeObserver.observe(toolbar)
        }
      }
    })

    window.addEventListener('scroll', updateFloatingToolbar, true)
    window.addEventListener('resize', updateFloatingToolbar)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    scrollContainer?.removeEventListener('scroll', updateFloatingToolbar)
    window.removeEventListener('scroll', updateFloatingToolbar, true)
    window.removeEventListener('resize', updateFloatingToolbar)
  })

  return { floating, placeholderHeight, floatingStyle, shellStyle, updateFloatingToolbar }
}
