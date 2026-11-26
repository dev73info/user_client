import { afterEach, describe, expect, it, vi } from 'vitest'

import { resetPortalScroll, scrollToPortalAnchor } from '@/utils/portalScroll'

function createRect(top: number, bottom: number) {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function markVisible(element: HTMLElement, top: number, bottom: number) {
  const bounds = createRect(top, bottom)
  element.style.display = 'block'
  element.style.visibility = 'visible'
  element.getBoundingClientRect = () => bounds
  element.getClientRects = () => [bounds] as unknown as DOMRectList
}

function mountFixture() {
  document.body.innerHTML = `
    <div class="app-shell-scrollbar">
      <div class="t73-scrollbar__wrap">
        <div class="t73-scrollbar__view">
          <header class="portal-header app-top-nav"></header>
          <div class="hidden-anchor"></div>
          <div class="visible-anchor"></div>
        </div>
      </div>
    </div>
  `

  const wrap = document.querySelector<HTMLElement>('.t73-scrollbar__wrap')!
  const header = document.querySelector<HTMLElement>('.portal-header.app-top-nav')!
  const hiddenAnchor = document.querySelector<HTMLElement>('.hidden-anchor')!
  const visibleAnchor = document.querySelector<HTMLElement>('.visible-anchor')!
  const scrollTo = vi.fn()

  markVisible(header, 0, 56)
  markVisible(hiddenAnchor, 0, 100)
  hiddenAnchor.style.display = 'none'
  markVisible(visibleAnchor, 200, 240)
  wrap.getBoundingClientRect = () => createRect(0, 600)
  Object.defineProperty(wrap, 'scrollHeight', { configurable: true, value: 1000 })
  Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 600 })
  Object.defineProperty(wrap, 'scrollTo', { configurable: true, value: scrollTo })

  return { wrap, scrollTo }
}

afterEach(() => {
  resetPortalScroll()
  vi.clearAllTimers()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('门户滚动锚点', () => {
  it('跳过不可见候选，把标题块底边落到顶栏底边', () => {
    vi.useFakeTimers()
    const { scrollTo } = mountFixture()

    scrollToPortalAnchor([
      { selector: '.hidden-anchor', edge: 'bottom' },
      { selector: '.visible-anchor', edge: 'bottom' },
    ])

    expect(scrollTo).toHaveBeenCalledWith({ top: 184, behavior: 'auto' })
  })

  it('切页时把滚动容器拉回顶部', () => {
    vi.useFakeTimers()
    const { wrap, scrollTo } = mountFixture()
    wrap.scrollTop = 143

    resetPortalScroll()

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
