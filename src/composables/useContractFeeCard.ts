import { computed, ref, type Ref } from 'vue'

import {
  getRequirementFeeTerms,
  isFeeTermsPending,
  type RequirementFeeTerms,
} from '@/api/requirementFee'
import type { RequirementItem } from '@/api/requirements'
import type { ContractParty } from '@/shared/contractSign'
import type { FeeViewerRole } from '@/shared/requirementFee'

type UseContractFeeCardOptions = {
  /** 需求详情：只有电签担保单才有平台服务费；自管模式不展示费率。 */
  requirement: Ref<RequirementItem | null>
  /** 本人是甲方（需求方）还是乙方（开发者）；未参与合同为 null。 */
  currentParty: Ref<ContractParty | null>
  /** 平台内置协议没有费用卡。 */
  isPlatformAgreement: Ref<boolean>
  token: () => string
}

/**
 * 合同签署页的费用快照：取数、角色与「要不要展示」。
 *
 * 404 有两种含义：自管模式没有费率（不展示），担保模式旧合同还没写快照（显示「费率待确认」）。
 * 这里用需求详情的 `payment_mode` 区分；详情没取到时用「接口是否返回过数据」兜底。
 */
export function useContractFeeCard(options: UseContractFeeCardOptions) {
  const feeTerms = ref<RequirementFeeTerms | null>(null)
  const feePending = ref(false)

  const feeRole = computed<FeeViewerRole>(() =>
    options.currentParty.value === 'party_b' ? 'developer' : 'customer',
  )
  const showFeeCard = computed(() => {
    if (options.isPlatformAgreement.value || !options.currentParty.value) {
      return false
    }
    if (options.requirement.value) {
      return options.requirement.value.payment_mode === 'platform_guarantee'
    }
    return feeTerms.value != null
  })

  /** 担保单读一次费率快照；自管模式不请求。 */
  async function loadFeeTerms(requirementId: string) {
    feeTerms.value = null
    feePending.value = false
    if (options.requirement.value?.payment_mode !== 'platform_guarantee') {
      return
    }
    try {
      feeTerms.value = await getRequirementFeeTerms(options.token(), requirementId)
    } catch (error) {
      feeTerms.value = null
      feePending.value = isFeeTermsPending(error)
    }
  }

  return { feeTerms, feePending, feeRole, showFeeCard, loadFeeTerms }
}
