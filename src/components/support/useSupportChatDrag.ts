import { computed, ref } from 'vue'

const TAB_WIDTH = 48
const MOBILE_BREAKPOINT_PX = 900
const DESKTOP_FAB_HEIGHT = 140
const MOBILE_FAB_HEIGHT = 48
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
  let moveHandler: ((event: PointerEvent) => void) | null = null
  let upHandler: ((event: PointerEvent) => void) | null = null

  function currentContainerLeft(): number {
    return side.value === 'right' ? window.innerWidth - TAB_WIDTH : 0
  }

  function currentFabHeight(): number {
    return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`).matches
      ? MOBILE_FAB_HEIGHT
      : DESKTOP_FAB_HEIGHT
  }

  function clampFabTop(value: number): number {
    return clamp(value, 8, Math.max(8, window.innerHeight - currentFabHeight() - 8))
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
    startContainerLeft = currentContainerLeft()
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
      window.innerWidth - TAB_WIDTH,
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
    side.value = left + TAB_WIDTH / 2 < window.innerWidth / 2 ? 'left' : 'right'
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
