import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage } from 'ui_73info'

import { getDevAccessStatus } from '@/api/auth'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  requiresAgreementGate,
  type RequirementBindGate,
} from '@/shared/devRequirementHall'
import type { RequirementItem } from '@/api/requirements/types'
import { useAuthStore } from '@/stores/auth'

/**
 * 开发者接单前的准入读数：只有**入驻协议签署状态**这一项，且来自契约端点。
 *
 * 为什么只剩这一项：预付保证金（`developer-order-deposit*`）与信用额度（`/credit/**`）
 * 在当前后端契约里**一条路径都没有**，前端拿不到「保证金够不够」「信用额度多少」的真实读数。
 * 硬要显示就只能编，编出来的读数会把「接不了单」写成「可接单」——所以这里不再读它们：
 * 担保单接单时后端按开发者可提现收益冻结保证金，余额不够会回 409 中文说明，前端照实转达即可。
 */
export function useDevOrderGate() {
  const auth = useAuthStore()
  const route = useRoute()
  const router = useRouter()

  const developerAgreementSigned = ref(false)
  const loaded = ref(false)

  /** 列表里每一行的「接单」按钮要吃的那份资格读数（纯函数在 `@/shared/devRequirementHall`）。 */
  const bindGate = computed<RequirementBindGate>(() => ({
    agreementSigned: developerAgreementSigned.value,
  }))

  /** 取接单准入读数（目前只有入驻协议签署状态这一项）。 */
  async function loadGateStatus() {
    if (!auth.token) {
      return
    }

    try {
      const accessStatus = await getDevAccessStatus(auth.token)
      developerAgreementSigned.value = accessStatus.developer_agreement_signed
      loaded.value = true
    } catch (error) {
      const message = describeBackendError(error, '加载接单资格失败')
      TMessage.error(message)
      developerAgreementSigned.value = false
      loaded.value = false
    }
  }

  /**
   * 点某一行的「接单」：担保单要过入驻协议，签完靠 `redirect_to` 回到大厅；其余直接进需求详情。
   */
  function openRequirement(
    requirement: Pick<RequirementItem, 'requirement_id' | 'payment_mode'>,
  ) {
    if (requiresAgreementGate(requirement) && !developerAgreementSigned.value) {
      goSignDeveloperAgreement(requirement.requirement_id)
      return
    }

    void router.push({
      name: 'dev-requirement-detail',
      params: { requirementId: requirement.requirement_id },
    })
  }

  /** 去签入驻协议；带需求号时签完回到该需求在大厅里的地址，不带就回当前页。 */
  function goSignDeveloperAgreement(requirementId?: string) {
    const redirectTo = requirementId
      ? `/workbench/developer/requirements/hall/${encodeURIComponent(requirementId)}`
      : route.fullPath
    void router.push({
      name: 'contract-sign',
      query: { agreement: 'developer', redirect_to: redirectTo },
    })
  }

  return {
    developerAgreementSigned,
    loaded,
    bindGate,
    loadGateStatus,
    openRequirement,
    goSignDeveloperAgreement,
  }
}
