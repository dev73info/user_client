import { computed, reactive, ref, watch } from 'vue'

import { TMessage } from 'ui_73info'

import { listMcResources, listMcResourceVersions, type McResourcePayload } from '@/api/mcResources'
import { useClientPagination } from '@/composables/useClientPagination'
import {
  countDevResources,
  filterDevResources,
  hasResourceListFilters,
  resourceListEmptyText,
  type DevResourceListFilters,
} from '@/shared/devResourceList'
import { isApiResourceKind } from '@/shared/resourceApi'
import { isPricedResource } from '@/shared/resourceSale'
import { useAuthStore } from '@/stores/auth'

async function loadCurrentVersionPrices(token: string, resources: McResourcePayload[]) {
  const candidates = resources.filter(
    (item) =>
      !isApiResourceKind(item.resource_kind) &&
      !isPricedResource(item.buyout_price_fen, item.price_points),
  )
  const entries = await Promise.all(
    candidates.map(async (item) => {
      const versions = await listMcResourceVersions(token, item.id)
      const current = versions.find((version) => version.is_current) ?? versions[0]
      return [item.id, current?.price_fen ?? 0] as const
    }),
  )
  return Object.fromEntries(entries) as Record<number, number>
}

/** 开发者资源列表、前端筛选分页与当前单版本售价。 */
export function useDevResourceList() {
  const auth = useAuthStore()
  const isLoading = ref(false)
  const resources = ref<McResourcePayload[]>([])
  const versionPrices = ref<Record<number, number>>({})
  const filters = reactive<DevResourceListFilters>({ keyword: '', visibility: '' })
  const hasActiveFilters = computed(() => hasResourceListFilters(filters))
  const filteredResources = computed(() => filterDevResources(resources.value, filters))
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
      const own = all.filter((item) => item.ownership_type !== 'team')
      versionPrices.value = await loadCurrentVersionPrices(auth.token, own)
      resources.value = own
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
    versionPrices,
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
