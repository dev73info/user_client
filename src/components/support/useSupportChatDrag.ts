/**
 * 侧边签的吸附与拖拽：贴左 / 右边缘、上下自由但限制在可视范围内。
 *
 * 从 `SupportChatWidget.vue` 拆出，逻辑与常量（`TAB` 宽度、桌面 / 移动档的签高、6px 点击阈值）
 * 逐行搬移。位移小于阈值视为点击，交给调用方决定展开 / 收起。
 */
import { computed, ref } from 'vue'

/** 侧边签宽度（近似，用于吸附计算） */
const TAB = 48
const MOBILE_BREAKPOINT_PX = 900
const DESKTOP_FAB_HEIGHT = 140
const MOBILE_FAB_HEIGHT = 48
/** 位移小于这个距离算点击，不算拖拽 */
const CLICK_DISTANCE_PX = 6

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
  let moveHandler: ((e: PointerEvent) => void) | null = null
  let upHandler: ((e: PointerEvent) => void) | null = null

  function currentContainerLeft(): number {
    return side.value === 'right' ? window.innerWidth - TAB : 0
  }

  function currentFabHeight(): number {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
      ? MOBILE_FAB_HEIGHT
      : DESKTOP_FAB_HEIGHT
  }

  function clampFabTop(value: number): number {
    return clamp(value, 8, Math.max(8, window.innerHeight - currentFabHeight()))
  }

  function handleViewportResize() {
    top.value = clampFabTop(top.value)
  }

  const widgetStyle = computed(() => {
    if (dragging.value && dragLeft.value !== null && dragTop.value !== null) {
      return { top: `${dragTop.value}px`, left: `${dragLeft.value}px` }
    }
    const style: Record<string, string> = { top: `${top.value}px` }
    if (side.value === 'right') style.right = '0px'
    else style.left = '0px'
    return style
  })

  function attachDragListeners() {
    moveHandler = (e: PointerEvent) => onDragMove(e)
    upHandler = (e: PointerEvent) => onDragEnd(e)
    window.addEventListener('pointermove', moveHandler)
    window.addEventListener('pointerup', upHandler)
    window.addEventListener('pointercancel', upHandler)
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

  function onDragStart(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    startX = e.clientX
    startY = e.clientY
    startTop = top.value
    startContainerLeft = currentContainerLeft()
    dragging.value = true
    dragLeft.value = startContainerLeft
    dragTop.value = startTop
    attachDragListeners()
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging.value) return
    dragLeft.value = clamp(startContainerLeft + (e.clientX - startX), 0, window.innerWidth - TAB)
    dragTop.value = clampFabTop(startTop + (e.clientY - startY))
  }

  function onDragEnd(e: PointerEvent) {
    if (!dragging.value) return
    detachDragListeners()

    const distance = Math.hypot(e.clientX - startX, e.clientY - startY)
    const left = dragLeft.value ?? startContainerLeft
    const topNow = dragTop.value ?? startTop

    dragging.value = false
    dragLeft.value = null
    dragTop.value = null

    // 位移很小视为点击：展开/收起
    if (distance < CLICK_DISTANCE_PX) {
      onTap()
      return
    }

    // 水平按靠近哪一侧贴边吸附；垂直方向自由，仅限制在可视范围内
    const centerX = left + TAB / 2
    side.value = centerX < window.innerWidth / 2 ? 'left' : 'right'
    top.value = clampFabTop(topNow)
  }

  /** 首次挂载时把签放在视口中线。 */
  function centerVertically() {
    top.value = clampFabTop((window.innerHeight - currentFabHeight()) / 2)
  }

  return {
    side,
    top,
    dragging,
    widgetStyle,
    onDragStart,
    handleViewportResize,
    detachDragListeners,
    centerVertically,
  }
}
