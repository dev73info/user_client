import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export type SpotlightPaginationItem = { key: string; label: string; page: number | null }

/** 首页精选区每页 8 张（4 列 × 2 行）；改这个数会同时影响栅格高度锁与「跳到第 N 页」的可用范围。 */
const DEFAULT_PAGE_SIZE = 8
/** 超过 9 页才折叠成「1 … n-1 n n+1 … last」，两侧各留 1 页。 */
const PAGE_WINDOW = 1
const MAX_FLAT_PAGES = 9

/**
 * 精选资源区的分页（R047 从 `views/HomeView.vue` 拆出）。
 *
 * 两处 DOM 依赖跟这里绑定，搬动时必须一起走：
 * - **栅格高度锁**：翻页前记下 `.portal-spotlight-grid` 的高度写成 `min-height`，`nextTick`
 *   后再取一次取较大值，避免翻页瞬间页面高度塌陷、滚动位置跳动。移动端（<=900px）是紧凑列表，
 *   不锁高度，并把上一轮留下的内联 `min-height` 清掉。
 * - **跳页浮层**：`…` 按钮点开输入框，浮层开着时点页面任何地方都关闭（`document` 上挂 click，
 *   `onBeforeUnmount` 摘掉）。浮层内的点击自己 `.stop`，不靠这里判断。
 *
 * 原来靠 `document.querySelector('.portal-spotlight-grid')` 找栅格；现在由组件传模板 ref，
 * 免得同页出现第二个精选区时锁错元素、或在单测里锁到别的用例残留的 DOM。
 */
export function useSpotlightPagination<T>(options: {
  items: Ref<readonly T[]>
  /** 分页要锁高度的栅格元素（组件模板 ref） */
  grid?: Ref<HTMLElement | null>
  pageSize?: number
}) {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
  const page = ref(1)

  const pageCount = computed(() => Math.max(1, Math.ceil(options.items.value.length / pageSize)))

  const pagedItems = computed(() => {
    const start = (page.value - 1) * pageSize
    return options.items.value.slice(start, start + pageSize)
  })

  function goPage(target: number) {
    if (target < 1 || target > pageCount.value || target === page.value) {
      return
    }

    // 元素先抓在手里：`nextTick` 里再读 ref，栅格若被整块替换就拿不到原来那个高度。
    const gridElement = options.grid?.value ?? null
    // 移动端是紧凑列表，不必锁 min-height；桌面端仍撑住高度避免翻页跳动。
    // jsdom 没有 `matchMedia`：按桌面处理（高度量出来是 0，锁不锁都是空操作）。
    const lockMinHeight =
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(min-width: 901px)').matches
    const previousHeight = gridElement?.offsetHeight ?? 0
    if (lockMinHeight && gridElement && previousHeight > 0) {
      gridElement.style.minHeight = `${previousHeight}px`
    }

    page.value = target

    void nextTick(() => {
      if (!gridElement) {
        return
      }
      if (!lockMinHeight) {
        gridElement.style.minHeight = ''
        return
      }
      const nextHeight = gridElement.offsetHeight
      gridElement.style.minHeight = `${Math.max(previousHeight, nextHeight)}px`
    })
  }

  // 资源变少（例如定时刷新后精选只剩一页）时把页码收回范围内，否则会停在一页空白上。
  watch(pageCount, (next) => {
    if (page.value > next) {
      page.value = next
    }
  })

  const paginationItems = computed<SpotlightPaginationItem[]>(() => {
    const total = pageCount.value
    const current = page.value
    const items: SpotlightPaginationItem[] = []
    if (total <= MAX_FLAT_PAGES) {
      for (let index = 1; index <= total; index += 1) {
        items.push({ key: `page-${index}`, label: String(index), page: index })
      }
      return items
    }

    items.push({ key: 'page-1', label: '1', page: 1 })
    const start = Math.max(2, current - PAGE_WINDOW)
    const end = Math.min(total - 1, current + PAGE_WINDOW)
    if (start > 2) {
      items.push({ key: 'ellipsis-left', label: '…', page: null })
    }
    for (let index = start; index <= end; index += 1) {
      items.push({ key: `page-${index}`, label: String(index), page: index })
    }
    if (end < total - 1) {
      items.push({ key: 'ellipsis-right', label: '…', page: null })
    }
    items.push({ key: `page-${total}`, label: String(total), page: total })
    return items
  })

  const jumpOpen = ref(false)
  const jumpAnchor = ref<string | null>(null)
  const jumpValue = ref('')

  /** 点 `…`：同一个锚点再点一次收起，换一个锚点则直接开在那一侧。 */
  function toggleJump(anchorKey: string) {
    if (jumpOpen.value && jumpAnchor.value === anchorKey) {
      jumpOpen.value = false
      return
    }
    jumpAnchor.value = anchorKey
    jumpValue.value = String(page.value)
    jumpOpen.value = true
  }

  /** 输入越界（含非数字）就夹回 [1, pageCount]；关浮层不依赖跳转成功。 */
  function submitJump() {
    const parsed = Number.parseInt(jumpValue.value, 10)
    if (Number.isFinite(parsed)) {
      goPage(Math.min(Math.max(parsed, 1), pageCount.value))
    }
    jumpOpen.value = false
  }

  function handleJumpOutsideClick() {
    if (jumpOpen.value) {
      jumpOpen.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleJumpOutsideClick)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleJumpOutsideClick)
  })

  return {
    page,
    pageCount,
    pagedItems,
    paginationItems,
    jumpOpen,
    jumpAnchor,
    jumpValue,
    goPage,
    toggleJump,
    submitJump,
  }
}
