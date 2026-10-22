import { computed, reactive, ref, watch } from 'vue'

import { TMessage } from 'ui_73info'

import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { useClientPagination } from '@/composables/useClientPagination'
import {
  countDevResources,
  filterDevResources,
  hasResourceListFilters,
  resourceListEmptyText,
  type DevResourceListFilters,
} from '@/shared/devResourceList'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者资源列表的数据、筛选与客户端分页。
 *
 * 从 `views/DevResourceListView.vue` 抽出，逻辑逐段照搬：数据源一次取回全部自有资源
 * （团队资源走团队页，这里滤掉 `ownership_type === 'team'`），筛选与分页都在前端做。
 *
 * 分页与其余菜单页同构（需求大厅、收益钱包、团队资源、我的接单都带表尾分页器）；
 * 这里用 `useClientPagination` 的客户端切片，不走服务端页码。
 */
export function useDevResourceList() {
  const auth = useAuthStore()

  const isLoading = ref(false)
  const resources = ref<McResourcePayload[]>([])

  // 搜索与状态筛选都在前端做，所以没有「查询」按钮，输入即过滤（口径见 shared/devResourceList.ts）。
  const filters = reactive<DevResourceListFilters>({
    keyword: '',
    visibility: '',
  })

  const hasActiveFilters = computed(() => hasResourceListFilters(filters))
  const filteredResources = computed(() => filterDevResources(resources.value, filters))

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空表。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged,
    resetPage,
  } = useClientPagination(filteredResources)
  watch(filters, resetPage)

  const counts = computed(() => countDevResources(resources.value))
  const emptyText = computed(() => resourceListEmptyText(isLoading.value, hasActiveFilters.value))

  async function loadResources() {
    if (!auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    isLoading.value = true
    try {
      const all = await listMcResources(auth.token)
      resources.value = all.filter((item) => item.ownership_type !== 'team')
    } catch (error) {
      const message = error instanceof Error ? error.message : '加载资源列表失败'
      TMessage.error(message)
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
    page,
    pageSize,
    filteredTotal,
    paged,
    emptyText,
    totalCount: computed(() => counts.value.total),
    publishedCount: computed(() => counts.value.published),
    reviewCount: computed(() => counts.value.review),
    draftCount: computed(() => counts.value.draft),
    archiveLockedCount: computed(() => counts.value.archiveLocked),
    loadResources,
  }
}
