import { computed, reactive, ref, watch } from 'vue'

import { listTeamResources, type McResourcePayload } from '@/api/mcResources'
import { useClientPagination } from '@/composables/useClientPagination'
import { resourceTagSummary } from '@/shared/resourcePresentation'
import { isResourceArchiveLocked } from '@/shared/resourcePresentation'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/**
 * 「团队资源」的取数、筛选与客户端分页。
 *
 * 与「资源项目」页同一套搜索与状态筛选口径：数据源一次取回全部，输入即过滤；
 * 分页与其余菜单页同构（需求大厅、收益钱包、资源项目、我的接单都带表尾分页器），
 * 所以这里是客户端切片，不走服务端页码。
 */
export function useTeamResources() {
  const auth = useAuthStore()

  const isLoading = ref(false)
  const resources = ref<McResourcePayload[]>([])

  const filters = reactive({
    keyword: '',
    visibility: '',
  })

  const hasActiveFilters = computed(
    () => Boolean(filters.keyword.trim()) || Boolean(filters.visibility),
  )

  const filteredResources = computed(() => {
    const keyword = filters.keyword.trim().toLowerCase()

    return resources.value.filter((item) => {
      if (filters.visibility && item.visibility !== filters.visibility) {
        return false
      }

      if (!keyword) {
        return true
      }

      return [item.title, item.author, item.description, resourceTagSummary(item)].some((value) =>
        (value ?? '').toLowerCase().includes(keyword),
      )
    })
  })

  /** 顶部读数条的口径与「资源项目」页一致：同一份数据按 visibility 分档。 */
  const publishedCount = computed(
    () => resources.value.filter((item) => item.visibility === 'published').length,
  )
  const reviewCount = computed(
    () => resources.value.filter((item) => item.visibility === 'review').length,
  )
  const draftCount = computed(
    () => resources.value.filter((item) => item.visibility === 'draft').length,
  )

  /** R014：团队资源里已进入超期锁定 / 已清除的数量；> 0 时表格上方给一条锁定说明。 */
  const archiveLockedCount = computed(
    () => resources.value.filter((item) => isResourceArchiveLocked(item)).length,
  )

  const emptyText = computed(() => {
    if (isLoading.value) {
      return '资源列表加载中'
    }
    return hasActiveFilters.value ? '没有符合筛选条件的团队资源' : '当前还没有团队资源记录'
  })

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
  const { page, pageSize, total: filteredTotal, paged } = useClientPagination(filteredResources)

  function resetPage() {
    page.value = 1
  }

  watch(filters, resetPage)

  async function loadResources() {
    if (!auth.token) {
      resources.value = []
      return
    }

    isLoading.value = true
    try {
      resources.value = await listTeamResources(auth.token)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载团队资源失败')
    } finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    resources,
    filters,
    hasActiveFilters,
    filteredResources,
    publishedCount,
    reviewCount,
    draftCount,
    archiveLockedCount,
    emptyText,
    page,
    pageSize,
    filteredTotal,
    paged,
    loadResources,
  }
}
