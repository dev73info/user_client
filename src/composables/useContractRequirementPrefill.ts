import { ref } from 'vue'

import { listMyRequirements } from '@/api/devRequirements'
import { listRequirements } from '@/api/requirements'
import type { ContractAttachmentParty } from '@/shared/contracts'

export type ContractRequirementPrefillOptions = {
  token: string
  requirementId: string
  /** 当前用户在这份合同上的身份：乙方走 `/dev/requirements/mine`，其余走 `/requirements/mine`。 */
  party: ContractAttachmentParty | null
}

/** 需求单里的预填信息（标题 / 预算 / 验收标准）。 */
export type ContractRequirementPrefill = {
  title: string
  budget: number | null
  acceptance_criteria: string
}

/**
 * 拟定表单的需求单预填（R047 从 `components/ContractAttachmentPanel.vue` 拆出）。
 *
 * 按当前身份选接口：需求方走 `/requirements/mine`，开发者走 `/dev/requirements/mine`，
 * 两边都拿不到（例如非当事人）就退化成空预填 —— 金额以后端校验为准，页面不因拿不到预算就崩。
 * 只加载一次（`loaded` 标记先翻，并发调用不会打两次）。
 */
export function useContractRequirementPrefill(options: ContractRequirementPrefillOptions) {
  const requirementInfo = ref<ContractRequirementPrefill | null>(null)
  const loaded = ref(false)

  async function ensureRequirementInfo() {
    if (loaded.value) {
      return
    }
    loaded.value = true
    try {
      const rows =
        options.party === 'party_b'
          ? await listMyRequirements(options.token)
          : await listRequirements(options.token)
      const matched = rows.find((row) => row.requirement_id === options.requirementId)
      requirementInfo.value = matched
        ? {
            title: matched.title,
            budget: matched.budget ?? null,
            acceptance_criteria: matched.acceptance_criteria ?? '',
          }
        : null
    } catch {
      requirementInfo.value = null
    }
  }

  return { requirementInfo, ensureRequirementInfo }
}
