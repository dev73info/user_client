import { ref } from 'vue'

/**
 * 工作台外壳的移动端抽屉：开关状态与左右滑动的手势判定。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。断点与 `@/shared/workbenchBarSlot` 的
 * `WORKBENCH_BAR_MEDIA`（900px）是同一档——这个档位以下才渲染移动端顶栏与抽屉，
 * 两处必须一起改，否则手机上会出现「有抽屉没顶栏」或者反过来。
 */

/** 与顶栏一档：900px 及以下走抽屉，以上是常驻侧边栏（与样式里的 @media 同值）。 */
export const MOBILE_MENU_BREAKPOINT_PX = 900
/** 从左边缘这个宽度以内起手才算「拉开抽屉」，避免和页面横向滚动打架。 */
const MOBILE_SWIPE_EDGE_PX = 44
/** 横向位移超过这个值才认作一次滑动，短促的点按不触发。 */
const MOBILE_SWIPE_THRESHOLD_PX = 72
/** 纵向位移超过这个值就当成上下滚动，不再判定横滑。 */
const MOBILE_SWIPE_VERTICAL_LIMIT_PX = 56

export function useWorkbenchMobileMenu() {
  const mobileMenuOpen = ref(false)
  const touchStartX = ref(0)
  const touchStartY = ref(0)
  const touchTracking = ref(false)

  function openMobileMenu() {
    mobileMenuOpen.value = true
  }

  function closeMobileMenu() {
    mobileMenuOpen.value = false
  }

  function isMobileWorkbenchViewport() {
    return (
      typeof window !== 'undefined' &&
      window.matchMedia(`(max-width: ${MOBILE_MENU_BREAKPOINT_PX}px)`).matches
    )
  }

  function handleWorkbenchTouchStart(event: TouchEvent) {
    if (!isMobileWorkbenchViewport()) {
      touchTracking.value = false
      return
    }

    const touch = event.touches[0]
    if (!touch) {
      touchTracking.value = false
      return
    }

    const canStartGesture = mobileMenuOpen.value || touch.clientX <= MOBILE_SWIPE_EDGE_PX
    touchTracking.value = canStartGesture
    touchStartX.value = touch.clientX
    touchStartY.value = touch.clientY
  }

  function handleWorkbenchTouchEnd(event: TouchEvent) {
    if (!touchTracking.value) {
      return
    }

    touchTracking.value = false
    const touch = event.changedTouches[0]
    if (!touch) {
      return
    }

    const deltaX = touch.clientX - touchStartX.value
    const deltaY = touch.clientY - touchStartY.value
    if (Math.abs(deltaY) > MOBILE_SWIPE_VERTICAL_LIMIT_PX) {
      return
    }

    if (!mobileMenuOpen.value && deltaX >= MOBILE_SWIPE_THRESHOLD_PX) {
      openMobileMenu()
      return
    }

    if (mobileMenuOpen.value && deltaX <= -MOBILE_SWIPE_THRESHOLD_PX) {
      closeMobileMenu()
    }
  }

  return {
    mobileMenuOpen,
    touchTracking,
    openMobileMenu,
    closeMobileMenu,
    isMobileWorkbenchViewport,
    handleWorkbenchTouchStart,
    handleWorkbenchTouchEnd,
  }
}
