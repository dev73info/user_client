import { onBeforeUnmount, type ComponentPublicInstance } from 'vue'

const MARQUEE_PX_PER_SECOND = 30

/**
 * 作者 / 开发者名字放不下时的左右往返滚动。
 *
 * 从 `ResourceCatalog.vue` 搬出来：量一次溢出宽度，写进 `--marquee-shift` 与
 * `--marquee-duration`，由样式里的 `is-overflowing` 决定是否真的动起来；
 * 尺寸变化（窗口缩放、字号变化）靠 `ResizeObserver` 重算。挂在卡片自己的
 * `:ref` 回调上，卡片卸载时断开观察。
 */
export function useAuthorMarquee() {
  function measureAuthorMarquee(viewport: HTMLElement) {
    const track = viewport.firstElementChild as HTMLElement | null
    const overflow = track ? Math.ceil(track.scrollWidth - viewport.clientWidth) : 0
    const scrolling = overflow > 1
    viewport.classList.toggle('is-overflowing', scrolling)
    viewport.style.setProperty('--marquee-shift', scrolling ? `-${overflow}px` : '0px')
    viewport.style.setProperty(
      '--marquee-duration',
      `${Math.max(3, overflow / MARQUEE_PX_PER_SECOND + 2)}s`,
    )
  }

  const observer =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const target = entry.target as HTMLElement
            const viewport = target.classList.contains(
              'portal-resource-browser__author-pill-viewport',
            )
              ? target
              : target.parentElement
            if (viewport) {
              measureAuthorMarquee(viewport)
            }
          }
        })

  function observe(el: Element | ComponentPublicInstance | null) {
    if (!(el instanceof HTMLElement)) {
      return
    }
    measureAuthorMarquee(el)
    if (observer) {
      observer.observe(el)
      if (el.firstElementChild) {
        observer.observe(el.firstElementChild)
      }
    }
  }

  onBeforeUnmount(() => {
    observer?.disconnect()
  })

  return { observe }
}
