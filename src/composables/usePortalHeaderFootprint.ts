import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 顶栏占位高度（`--portal-header-footprint`）。
 *
 * 跨文件契约：这个自定义属性由顶栏写在 `document.documentElement` 上，由
 * `components/workbench/WorkbenchSidebar.vue`（以及需要贴在顶栏下方的页面头）读走，
 * 用来算 sticky 偏移与侧栏高度。取值是顶栏的实际占位高度（含上下外边距），会随断点
 * 从单行变双行，所以用 ResizeObserver 盯着，不能只在挂载时算一次。
 *
 * ⚠️ 只观察顶栏自己是不够的：非首页路由在 ≤900px 时顶栏被 `display:none`
 * （`App.vue` 的 `.app-top-nav:not(.app-top-nav--home)`），此时它没有 box，占位写成 0；
 * 窗口再拉宽回 >900px 时，观察一个刚恢复显示的元素并不保证补发一次尺寸变化，
 * 属性就会停在 0，工作台侧栏的 sticky 偏移因此算错（顶栏会盖住侧栏顶部）。
 * 所以额外观察 `documentElement` —— 视口一变化必有一次回调，再由它重新量一次顶栏。
 */
export function usePortalHeaderFootprint() {
  const headerRef = ref<HTMLElement | null>(null)
  let headerObserver: ResizeObserver | undefined

  function syncHeaderFootprint() {
    const header = headerRef.value
    if (!header) return
    const styles = getComputedStyle(header)
    const footprint =
      header.offsetHeight === 0
        ? 0
        : Math.round(
            header.offsetHeight + parseFloat(styles.marginTop) + parseFloat(styles.marginBottom),
          )
    document.documentElement.style.setProperty('--portal-header-footprint', `${footprint}px`)
  }

  onMounted(() => {
    syncHeaderFootprint()
    if (typeof ResizeObserver !== 'undefined' && headerRef.value) {
      headerObserver = new ResizeObserver(syncHeaderFootprint)
      headerObserver.observe(headerRef.value)
      // 顶栏被 display:none 时不产生 box，仅观察它会漏掉「重新显示」那一次；
      // 观察根元素可以在视口变化时兜住，见文件头说明。
      headerObserver.observe(document.documentElement)
    }
  })

  onBeforeUnmount(() => {
    headerObserver?.disconnect()
    headerObserver = undefined
  })

  return { headerRef, syncHeaderFootprint }
}
