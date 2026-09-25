import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

/** 每页条数档位：菜单页列表统一用这一组，与需求大厅、收益钱包的分页器一致。 */
export const LIST_PAGE_SIZES: number[] = [10, 20, 50]

/** 默认每页条数：与需求大厅的服务端分页口径一致。 */
export const DEFAULT_LIST_PAGE_SIZE = 10

/**
 * 菜单页列表的客户端分页。
 *
 * 只用于「一次取回全部行、在前端过滤」的列表页（资源项目、团队资源、我的接单）。
 * 需求大厅走服务端分页，不要用这个，否则会与后端页码打架。
 *
 * 筛选条件变化后要回到第 1 页：把各页工具栏的筛选处理函数里顺手调一次 `resetPage()`，
 * 不要在这里 watch 源数组长度——过滤前后条数相同（比如从「公开 12 条」切到「私有 12 条」）
 * 时长度没变，页码就会停在越界的位置上。
 */
export function useClientPagination<T>(source: Ref<T[]> | ComputedRef<T[]>) {
  const page = ref(1)
  const pageSize = ref(DEFAULT_LIST_PAGE_SIZE)
  const total = computed(() => source.value.length)
  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

  const paged = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return source.value.slice(start, start + pageSize.value)
  })

  // 兜底：数据变少或每页条数调大后，停在越界页会渲染出空列表。
  watch([total, pageSize], () => {
    if (page.value > pageCount.value) {
      page.value = 1
    }
  })

  function resetPage() {
    page.value = 1
  }

  return { page, pageSize, total, pageCount, paged, resetPage }
}
