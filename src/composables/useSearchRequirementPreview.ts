import { computed, ref } from 'vue'

import {
  getWorkbenchRequirementHallItem,
  type PublicRequirementSpotlightItem,
} from '@/api/requirements'
import {
  canOpenRequirementWorkbench,
  requirementDetailAcceptanceHtml,
  requirementDetailDescriptionHtml,
} from '@/shared/requirementDisplay'
import { mergeRequirementDetail } from '@/shared/searchResults'
import { useAuthStore } from '@/stores/auth'

/**
 * 搜索结果里「点需求卡片 → 页内详情弹窗」这一域。
 *
 * 弹窗先拿精选摘要立刻渲染（标题 / 编号 / 预算 / 状态都是摘要里就有的），
 * 验收标准精选接口常常不给，于是再向工作台接口补一次详情：
 * - 有 token 才补（没登录也能看摘要，只是验收标准那格停在占位文案）；
 * - 补回来时先核对「弹窗里还是这条吗」，用户已经换了一条就把结果丢掉；
 * - 补失败不弹错——摘要够用，静默保留当前信息（拆分前就是这个取舍）。
 */
export function useSearchRequirementPreview() {
  const auth = useAuthStore()

  const selectedRequirement = ref<PublicRequirementSpotlightItem | null>(null)
  const detailLoading = ref(false)

  const descriptionHtml = computed(() =>
    requirementDetailDescriptionHtml(selectedRequirement.value?.description),
  )
  const acceptanceHtml = computed(() =>
    requirementDetailAcceptanceHtml(
      selectedRequirement.value?.acceptance_criteria,
      detailLoading.value,
    ),
  )
  /** 自己发的需求不给「前往工作台接取」；未登录也不给。 */
  const canClaim = computed(() =>
    canOpenRequirementWorkbench(auth.isAuthed, auth.username, selectedRequirement.value),
  )

  function open(requirement: PublicRequirementSpotlightItem) {
    selectedRequirement.value = requirement
    void fillDetail(requirement)
  }

  function close() {
    detailLoading.value = false
    selectedRequirement.value = null
  }

  async function fillDetail(requirement: PublicRequirementSpotlightItem) {
    if (requirement.acceptance_criteria?.trim()) {
      return
    }

    auth.hydrate()
    if (!auth.token) {
      return
    }

    detailLoading.value = true
    try {
      const detail = await getWorkbenchRequirementHallItem(auth.token, requirement.requirement_id)
      if (selectedRequirement.value?.requirement_id !== requirement.requirement_id) {
        return
      }

      selectedRequirement.value = mergeRequirementDetail(selectedRequirement.value, detail)
    } catch {
      // 搜索结果已有公开摘要，详情补齐失败时保留当前信息。
    } finally {
      if (selectedRequirement.value?.requirement_id === requirement.requirement_id) {
        detailLoading.value = false
      }
    }
  }

  return { selectedRequirement, descriptionHtml, acceptanceHtml, canClaim, open, close }
}
