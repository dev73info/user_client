import { computed, ref } from 'vue'

const MOBILE_BREAKPOINT_PX = 900
const DESKTOP_FAB_WIDTH = 32
const MOBILE_FAB_WIDTH = 30
const DESKTOP_FAB_HEIGHT = 92
const MOBILE_FAB_HEIGHT = 88
const CLICK_DISTANCE_PX = 6
/** 移动端底部 Dock：bottom 8px + 高度约 58px + 8px 间距。 */
const MOBILE_DOCK_RESERVE = 74
const MOBILE_TOP_INSET = 48
const DESKTOP_TOP_INSET = 30

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function useSupportChatDrag(onTap: () => void) {
  const side = ref<'left' | 'right'>('right')
  const top = ref(0)
  const dragging = ref(false)
  const dragLeft = ref<number | null>(null)
  const dragTop = ref<number | null>(null)
  let startX = 0
  let startY = 0
  let startTop = 0
  let startContainerLeft = 0
  let dragTabWidth = DESKTOP_FAB_WIDTH
  let moveHandler: ((event: PointerEvent) => void) | null = null
  let upHandler: ((event: PointerEvent) => void) | null = null

  function isMobile(): boolean {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
  }

  function currentFabWidth(): number {
    const width = document.querySelector<HTMLElement>('.support-fab')?.getBoundingClientRect().width
    if (width && width > 0) return width
    return isMobile() ? MOBILE_FAB_WIDTH : DESKTOP_FAB_WIDTH
  }

  function currentFabHeight(): number {
    const height = document
      .querySelector<HTMLElement>('.support-fab')
      ?.getBoundingClientRect().height
    if (height && height > 0) return height
    return isMobile() ? MOBILE_FAB_HEIGHT : DESKTOP_FAB_HEIGHT
  }

  /** Dock 实际占高（含安全区）；取不到时用固定预留值兜底。 */
  function mobileDockReserve(): number {
    const dock = document.querySelector<HTMLElement>('.portal-mobile-dock')
    if (dock) {
      const rect = dock.getBoundingClientRect()
      if (rect.height > 0) return window.innerHeight - rect.top + 8
    }
    return MOBILE_DOCK_RESERVE
  }

  function clampFabTop(value: number): number {
    const mobile = isMobile()
    // 移动端给底部 Dock 留位，避免拖到最底部后按钮被 Dock 盖住点不到。
    const bottomGap = mobile ? mobileDockReserve() : 8
    const topInset = mobile ? MOBILE_TOP_INSET : DESKTOP_TOP_INSET
    return clamp(
      value,
      topInset,
      Math.max(topInset, window.innerHeight - currentFabHeight() - bottomGap),
    )
  }

  function handleViewportResize() {
    top.value = clampFabTop(top.value)
  }

  const widgetStyle = computed(() => {
    if (dragging.value && dragLeft.value !== null && dragTop.value !== null) {
      return { top: `${dragTop.value}px`, left: `${dragLeft.value}px` }
    }
    const style: Record<string, string> = { top: `${top.value}px` }
    if (side.value === 'right') style.right = 'max(0px, env(safe-area-inset-right, 0px))'
    else style.left = 'max(0px, env(safe-area-inset-left, 0px))'
    return style
  })

  function currentContainerLeft(): number | null {
    const widget = document.querySelector<HTMLElement>('.support-widget')
    if (!widget) return null
    const rect = widget.getBoundingClientRect()
    return rect.width > 0 ? rect.left : null
  }

  function detachDragListeners() {
    if (moveHandler) window.removeEventListener('pointermove', moveHandler)
    if (upHandler) {
      window.removeEventListener('pointerup', upHandler)
      window.removeEventListener('pointercancel', upHandler)
    }
    moveHandler = null
    upHandler = null
  }

  function onDragStart(event: PointerEvent) {
    if (dragging.value || (event.pointerType === 'mouse' && event.button !== 0)) return
    startX = event.clientX
    startY = event.clientY
    startTop = top.value
    dragTabWidth = currentFabWidth()
    startContainerLeft =
      currentContainerLeft() ?? (side.value === 'right' ? window.innerWidth - dragTabWidth : 0)
    dragging.value = true
    dragLeft.value = startContainerLeft
    dragTop.value = startTop
    moveHandler = onDragMove
    upHandler = onDragEnd
    window.addEventListener('pointermove', moveHandler)
    window.addEventListener('pointerup', upHandler)
    window.addEventListener('pointercancel', upHandler)
  }

  function onDragMove(event: PointerEvent) {
    if (!dragging.value) return
    dragLeft.value = clamp(
      startContainerLeft + event.clientX - startX,
      0,
      window.innerWidth - dragTabWidth,
    )
    dragTop.value = clampFabTop(startTop + event.clientY - startY)
  }

  function onDragEnd(event: PointerEvent) {
    if (!dragging.value) return
    detachDragListeners()
    const distance = Math.hypot(event.clientX - startX, event.clientY - startY)
    const left = dragLeft.value ?? startContainerLeft
    const topNow = dragTop.value ?? startTop
    dragging.value = false
    dragLeft.value = null
    dragTop.value = null
    if (distance < CLICK_DISTANCE_PX) {
      onTap()
      return
    }
    side.value = left + dragTabWidth / 2 < window.innerWidth / 2 ? 'left' : 'right'
    top.value = clampFabTop(topNow)
  }

  function centerVertically() {
    top.value = clampFabTop((window.innerHeight - currentFabHeight()) / 2)
  }

  return {
    side,
    dragging,
    widgetStyle,
    onDragStart,
    handleViewportResize,
    detachDragListeners,
    centerVertically,
  }
}
