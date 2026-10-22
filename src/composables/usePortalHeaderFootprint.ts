import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * 顶栏占位高度（`--portal-header-footprint`）。
 *
 * 跨文件契约：这个自定义属性由顶栏写在 `document.documentElement` 上，由
 * `components/workbench/WorkbenchSidebar.vue`（以及需要贴在顶栏下方的页面头）读走，
 * 用来算 sticky 偏移与侧栏高度。取值是顶栏的实际占位高度（含上下外边距），会随断点
 * 从单行变双行，所以用 ResizeObserver 盯着，不能只在挂载时算一次。
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
    }
  })

  onBeforeUnmount(() => {
    headerObserver?.disconnect()
    headerObserver = undefined
  })

  return { headerRef, syncHeaderFootprint }
}
