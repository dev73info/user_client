const TARGET_POLL_INTERVAL_MS = 60
const TARGET_POLL_LIMIT_MS = 3000
const LAYOUT_SETTLE_MS = 120
const STABLE_CHECK_COUNT = 2
const CORRECTION_DELAYS_MS = [300, 700, 1300, 2000]
const INTERRUPT_GUARD_MS = 150
const INTERRUPT_CLEANUP_MS = 5200

/** 后一次定位会让前一次还在等布局的轮询失效，避免旧路由的循环滚动新页面。 */
let activeRun = 0

/** 门户一级栏目进入后对齐到的内容起点（顶栏高度由 `scrollToPortalAnchor` 让出）。 */
export const PORTAL_CONTENT_ANCHORS: Record<string, string> = {
  resources: '.catalog-toolbar',
  'resource-catalog': '.catalog-toolbar',
  'requirement-hall': '.portal-page__content',
  community: '.community-toolbar',
}

/**
 * 把门户页滚动到内容区起点。顶栏是 sticky 的，目标位置要额外让出顶栏高度。
 * 路由组件由 Suspense 异步挂载，页面数据也会晚于首帧到达，所以用定时轮询等目标位置
 * 稳定后直接落位（不走平滑动画，避免被浏览器后续的 hash 滚动/布局变化打断）。
 *
 * 浏览器处理 hash 路由的首次加载/查询串改写时可能稍后把页面拉回顶部；这里在落位后
 * 再补几次定位。用户一旦自己滚动或点击，就不再纠正。
 */
export function scrollToPortalAnchor(selector: string) {
  if (typeof window === 'undefined') return

  const runId = ++activeRun
  const startedAt = window.performance.now()
  let lastTargetTop: number | null = null
  let stableChecks = 0
  let userInterrupted = false
  let pollTimer = 0

  const interrupt = () => {
    userInterrupted = true
  }
  const interruptEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
  /* 等导航点击自己的 pointer 事件走完再挂监听，避免把这次点击当成「用户中断」。 */
  window.setTimeout(
    () =>
      interruptEvents.forEach((name) =>
        window.addEventListener(name, interrupt, { passive: true, once: true }),
      ),
    INTERRUPT_GUARD_MS,
  )
  /* 纠正窗口结束后摘掉监听，避免每次换页在 window 上累积。 */
  window.setTimeout(() => {
    interruptEvents.forEach((name) => window.removeEventListener(name, interrupt))
    window.clearInterval(pollTimer)
  }, INTERRUPT_CLEANUP_MS)

  function getScrollWrap() {
    return document.querySelector<HTMLElement>('.app-shell-scrollbar > .t73-scrollbar__wrap')
  }

  function getHeaderHeight() {
    const header = document.querySelector<HTMLElement>('.portal-header.app-top-nav')
    return header && window.getComputedStyle(header).display !== 'none'
      ? header.getBoundingClientRect().height
      : 0
  }

  function getDestination() {
    const target = document.querySelector<HTMLElement>(selector)
    const wrap = getScrollWrap()
    if (!target || !wrap) return null
    const targetTop =
      target.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop
    return Math.max(0, targetTop - getHeaderHeight())
  }

  function placeAtAnchor() {
    if (runId !== activeRun) return
    const target = document.querySelector<HTMLElement>(selector)
    const wrap = getScrollWrap()
    if (!target || !wrap) return

    const targetTop =
      target.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop
    const destination = Math.max(0, targetTop - getHeaderHeight())
    if (lastTargetTop !== null && Math.abs(targetTop - lastTargetTop) <= 1) {
      stableChecks += 1
    } else {
      stableChecks = 0
    }
    lastTargetTop = targetTop

    if (stableChecks < STABLE_CHECK_COUNT) return

    wrap.scrollTop = destination
    window.clearInterval(pollTimer)

    CORRECTION_DELAYS_MS.forEach((delay) => {
      window.setTimeout(() => {
        if (runId !== activeRun || userInterrupted) return
        const nextDestination = getDestination()
        const nextWrap = getScrollWrap()
        if (nextDestination === null || !nextWrap) return
        if (Math.abs(nextWrap.scrollTop - nextDestination) <= 1) return
        nextWrap.scrollTop = nextDestination
      }, delay)
    })
  }

  pollTimer = window.setInterval(() => {
    if (runId !== activeRun || userInterrupted) {
      window.clearInterval(pollTimer)
      return
    }
    const target = document.querySelector<HTMLElement>(selector)
    const wrap = getScrollWrap()
    if (!target || !wrap) {
      if (window.performance.now() - startedAt >= TARGET_POLL_LIMIT_MS) {
        window.clearInterval(pollTimer)
      }
      return
    }

    if (window.performance.now() - startedAt < LAYOUT_SETTLE_MS) return
    placeAtAnchor()
  }, TARGET_POLL_INTERVAL_MS)
}
