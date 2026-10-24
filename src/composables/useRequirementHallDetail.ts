import { computed, ref, watch, type Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getWorkbenchRequirementHallItem,
  type PublicRequirementSpotlightItem,
} from '@/api/requirements'
import {
  canOpenRequirementWorkbench,
  requirementDetailAcceptanceHtml,
  requirementDetailDescriptionHtml,
  requirementOwnedByCurrentUser,
} from '@/shared/requirementDisplay'
import { useAuthStore } from '@/stores/auth'

/**
 * 需求大厅的详情弹窗。
 *
 * 从 `views/RequirementHallView.vue` 抽出：点卡片开详情、URL 里带 `requirement_id` / `view` 时
 * 自动开、补齐精选列表里缺的验收标准、关闭时清 query、以及「前往工作台接取需求」的跳转。
 * 列表本身在 `useRequirementHall` 里，这里只借它的 `requirements` 找目标、借 `loading` 做时序判断。
 */
export function useRequirementHallDetail(sources: {
  requirements: Ref<PublicRequirementSpotlightItem[]>
  loading: Ref<boolean>
}) {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()

  const selectedRequirement = ref<PublicRequirementSpotlightItem | null>(null)
  const selectedRequirementDetailLoading = ref(false)

  const selectedRequirementDescriptionHtml = computed(() =>
    requirementDetailDescriptionHtml(selectedRequirement.value?.description),
  )
  const selectedRequirementAcceptanceHtml = computed(() =>
    requirementDetailAcceptanceHtml(
      selectedRequirement.value?.acceptance_criteria,
      selectedRequirementDetailLoading.value,
    ),
  )

  /** 自己发的需求不给「前往工作台接取」。 */
  const isSelectedRequirementOwnedByCurrentUser = computed(() =>
    requirementOwnedByCurrentUser(auth.isAuthed, auth.username, selectedRequirement.value),
  )

  /** 详情弹窗底部「前往工作台接取需求」的可见性：登录了、且不是自己发的需求。 */
  const canOpenWorkbench = computed(() =>
    canOpenRequirementWorkbench(auth.isAuthed, auth.username, selectedRequirement.value),
  )

  watch(
    () => [route.query.requirement_id, route.query.view] as const,
    () => {
      openRouteRequirementDetail()
    },
  )

  /*
   * 列表换过一轮之后再按 URL 开一次详情：这段原来写在 `loadHallData` 的末尾
   * （请求结束、列表已替换、`loading` 刚落回 false 时）。拆分后列表与详情在两个 composable 里，
   * 用「`loading` 由 true 变 false」这个边沿表达同一时机，既不用回调也不会漏掉首次进页面那一次。
   */
  watch(
    () => sources.loading.value,
    (now, before) => {
      if (before && !now) {
        openRouteRequirementDetail()
      }
    },
  )

  function routeRequirementId(): string {
    const rawValue = route.query.requirement_id ?? route.query.view
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
    return typeof value === 'string' ? value.trim() : ''
  }

  function openRequirementDetail(item: PublicRequirementSpotlightItem) {
    selectedRequirement.value = item
    void loadRequirementDetailForModal(item)
  }

  function openRouteRequirementDetail() {
    const requirementId = routeRequirementId()
    if (!requirementId || sources.loading.value) {
      return
    }

    if (selectedRequirement.value?.requirement_id === requirementId) {
      return
    }

    const target = sources.requirements.value.find((item) => item.requirement_id === requirementId)
    if (target) {
      openRequirementDetail(target)
    }
  }

  function closeRequirementDetail() {
    selectedRequirementDetailLoading.value = false
    selectedRequirement.value = null

    if (routeRequirementId()) {
      const nextQuery = { ...route.query }
      delete nextQuery.requirement_id
      delete nextQuery.view
      void router.replace({ query: nextQuery })
    }
  }

  function openRequirementWorkbench(requirement: PublicRequirementSpotlightItem) {
    void router.push({
      name: 'dev-requirement-detail',
      params: { requirementId: requirement.requirement_id },
    })
  }

  async function loadRequirementDetailForModal(item: PublicRequirementSpotlightItem) {
    if (item.acceptance_criteria?.trim()) {
      return
    }

    auth.hydrate()
    if (!auth.token) {
      return
    }

    selectedRequirementDetailLoading.value = true
    try {
      const detail = await getWorkbenchRequirementHallItem(auth.token, item.requirement_id)
      if (selectedRequirement.value?.requirement_id !== item.requirement_id) {
        return
      }

      selectedRequirement.value = {
        ...selectedRequirement.value,
        title: detail.title,
        description: detail.description ?? selectedRequirement.value.description,
        acceptance_criteria:
          detail.acceptance_criteria ?? selectedRequirement.value.acceptance_criteria,
        budget: detail.budget ?? selectedRequirement.value.budget,
        payment_mode: detail.payment_mode,
        status: detail.status,
        updated_at: detail.updated_at,
      }
    } catch {
      // 公共详情仍可展示精选列表已有信息；完整详情补齐失败时保持当前内容。
    } finally {
      if (selectedRequirement.value?.requirement_id === item.requirement_id) {
        selectedRequirementDetailLoading.value = false
      }
    }
  }

  return {
    // 详情数据
    selectedRequirement,
    selectedRequirementDetailLoading,
    selectedRequirementDescriptionHtml,
    selectedRequirementAcceptanceHtml,
    // 身份判定
    isSelectedRequirementOwnedByCurrentUser,
    canOpenWorkbench,
    // 动作
    openRequirementDetail,
    openRouteRequirementDetail,
    closeRequirementDetail,
    openRequirementWorkbench,
  }
}
