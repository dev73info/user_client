const TARGET_POLL_INTERVAL_MS = 60
const TARGET_POLL_LIMIT_MS = 3000
const CORRECTION_DELAYS_MS = [100, 300, 700, 1300, 2000]
const INTERRUPT_GUARD_MS = 150

/** 后一次定位会让前一次还在等布局的轮询失效，避免旧路由的循环滚动新页面。 */
let activeRun = 0
let activeCleanup: (() => void) | null = null

function getScrollWrap() {
  return document.querySelector<HTMLElement>('.app-shell-scrollbar > .t73-scrollbar__wrap')
}

function getHeaderBottom(wrapTop: number) {
  const header = document.querySelector<HTMLElement>('.portal-header.app-top-nav')
  return header && isVisible(header)
    ? Math.max(0, header.getBoundingClientRect().bottom - wrapTop)
    : 0
}

function isVisible(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    element.getClientRects().length > 0
  )
}

function setScrollTop(wrap: HTMLElement, top: number) {
  if (Math.abs(wrap.scrollTop - top) <= 1) return
  if (typeof wrap.scrollTo === 'function') {
    wrap.scrollTo({ top, behavior: 'auto' })
    return
  }
  wrap.scrollTop = top
}

export interface PortalScrollAnchor {
  selector: string
  /** 用目标的上沿还是下沿对齐顶栏底边；栏目页标题块取底边，移动端整页兜底取上沿。 */
  edge: 'top' | 'bottom'
}

/** 门户一级栏目进入后对齐到的页面标题（顶栏底边由 `scrollToPortalAnchor` 让出）。 */
export const PORTAL_CONTENT_ANCHORS: Record<string, readonly PortalScrollAnchor[]> = {
  resources: [
    { selector: '.catalog-hero', edge: 'bottom' },
    { selector: '.mobile-resource-page', edge: 'top' },
  ],
  'resource-catalog': [
    { selector: '.catalog-hero', edge: 'bottom' },
    { selector: '.mobile-resource-page', edge: 'top' },
  ],
  'requirement-hall': [
    { selector: '.requirement-hero', edge: 'bottom' },
    { selector: '.portal-page__content', edge: 'top' },
  ],
  community: [
    { selector: '.community-hero', edge: 'bottom' },
    { selector: '.community-toolbar', edge: 'top' },
  ],
}

/** 路径切换时先清掉上一页的位置，避免没有锚点的页面（如首页）继承旧滚动偏移。 */
export function resetPortalScroll() {
  if (typeof window === 'undefined') return
  activeCleanup?.()
  activeRun += 1
  const wrap = getScrollWrap()
  if (wrap) setScrollTop(wrap, 0)
}

/**
 * 把门户页滚动到页面标题块的指定边缘。顶栏是 sticky 的，目标位置要额外让出顶栏底边。
 * 路由组件由 Suspense 异步挂载：一旦目标出现就立即落位，再在布局稳定前补几次纠正。
 * 首帧落位走 MutationObserver，尽量在浏览器绘制前完成，避免先闪一下页面顶部。
 *
 * 浏览器处理 hash 路由的首次加载/查询串改写时可能稍后把页面拉回顶部；这里在落位后
 * 再补几次定位。用户一旦自己滚动或点击，就不再纠正。
 */
export function scrollToPortalAnchor(anchors: readonly PortalScrollAnchor[]) {
  if (typeof window === 'undefined' || anchors.length === 0) return

  activeCleanup?.()
  const runId = ++activeRun
  let userInterrupted = false
  let pollTimer = 0
  let discoveryTimer = 0
  let observer: MutationObserver | null = null
  let guardTimer = 0
  const correctionTimers: number[] = []

  const interrupt = () => {
    userInterrupted = true
    cleanup()
  }
  const interruptEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
  /* 等导航点击自己的 pointer 事件走完再挂监听，避免把这次点击当成「用户中断」。 */
  guardTimer = window.setTimeout(
    () =>
      interruptEvents.forEach((name) =>
        window.addEventListener(name, interrupt, { passive: true, once: true }),
      ),
    INTERRUPT_GUARD_MS,
  )

  function cleanup() {
    if (pollTimer) window.clearInterval(pollTimer)
    if (discoveryTimer) window.clearTimeout(discoveryTimer)
    if (guardTimer) window.clearTimeout(guardTimer)
    observer?.disconnect()
    observer = null
    interruptEvents.forEach((name) => window.removeEventListener(name, interrupt))
    correctionTimers.forEach((timer) => window.clearTimeout(timer))
    if (activeCleanup === cleanup) activeCleanup = null
  }

  function getDestination() {
    const wrap = getScrollWrap()
    if (!wrap) return null
    let anchor: PortalScrollAnchor | null = null
    let target: HTMLElement | null = null
    for (const candidate of anchors) {
      const nextTarget = document.querySelector<HTMLElement>(candidate.selector)
      if (!nextTarget || !isVisible(nextTarget)) continue
      target = nextTarget
      anchor = candidate
      break
    }
    if (!anchor || !target) return null
    const wrapRect = wrap.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const targetEdge =
      (anchor.edge === 'bottom' ? targetRect.bottom : targetRect.top) -
      wrapRect.top +
      wrap.scrollTop
    const destination = targetEdge - getHeaderBottom(wrapRect.top)
    const maxScrollTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight)
    return Math.min(maxScrollTop, Math.max(0, destination))
  }

  function placeAtAnchor() {
    if (runId !== activeRun || userInterrupted) return false
    const destination = getDestination()
    const wrap = getScrollWrap()
    if (destination === null || !wrap) return false
    setScrollTop(wrap, destination)
    return true
  }

  function stopDiscovery() {
    if (pollTimer) window.clearInterval(pollTimer)
    if (discoveryTimer) window.clearTimeout(discoveryTimer)
    observer?.disconnect()
    observer = null
    pollTimer = 0
    discoveryTimer = 0
  }

  function settle() {
    if (runId !== activeRun || userInterrupted) {
      cleanup()
      return true
    }
    if (!placeAtAnchor()) return false

    stopDiscovery()
    CORRECTION_DELAYS_MS.forEach((delay, index) => {
      correctionTimers.push(
        window.setTimeout(() => {
          if (runId !== activeRun || userInterrupted) {
            cleanup()
            return
          }
          placeAtAnchor()
          if (index === CORRECTION_DELAYS_MS.length - 1) cleanup()
        }, delay),
      )
    })
    return true
  }

  activeCleanup = cleanup
  if (settle()) return

  const observeRoot = getScrollWrap() ?? document.body
  if (typeof MutationObserver !== 'undefined' && observeRoot) {
    observer = new MutationObserver(() => {
      settle()
    })
    observer.observe(observeRoot, { childList: true, subtree: true })
  }
  pollTimer = window.setInterval(settle, TARGET_POLL_INTERVAL_MS)
  discoveryTimer = window.setTimeout(cleanup, TARGET_POLL_LIMIT_MS)
}
