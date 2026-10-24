import { TMessage } from 'ui_73info'
import { useDevOrderGate } from '@/composables/useDevOrderGate'
import { useDevRequirementBinding } from '@/composables/useDevRequirementBinding'
import { useDevRequirementDetail } from '@/composables/useDevRequirementDetail'

/**
 * 需求详情页的取数时序（三块状态各管各的，这里只排先后）。
 *
 * 一次进页要打三类接口：需求单、资源清单、接单准入（`GET /api/auth/dev-access-status`，
 * 现在只剩入驻协议这一项读数）。
 * 顺序上只有一处有要求——`ensureInitialBindingMode()` 得等资源清单到手，
 * 否则「有没有现成私有资源」恒为假，会把所有人先扔进「初始化新资源」那一支。
 * 失败口径沿用拆分前：需求单取不到就整页空态 + 报错，其余并发请求一起收摊。
 */
export function useDevRequirementDetailPage() {
  const detail = useDevRequirementDetail()
  const gate = useDevOrderGate()
  const binding = useDevRequirementBinding({
    requirementId: detail.requirementId,
    requirement: detail.requirement,
    capacity: {
      agreementSigned: gate.developerAgreementSigned,
    },
  })

  async function loadPage() {
    if (!detail.auth.token) {
      TMessage.error('登录状态已失效，请重新登录')
      return
    }

    if (!detail.requirementId.value) {
      detail.requirement.value = null
      TMessage.error('需求编号无效')
      return
    }

    detail.loading.value = true
    try {
      binding.resetBindingState()
      const [currentRequirement] = await Promise.all([
        detail.loadRequirement(),
        gate.loadGateStatus(),
        binding.loadResources(),
      ])
      detail.requirement.value = currentRequirement
      await binding.ensureInitialBindingMode()
    } catch (error) {
      detail.requirement.value = null
      TMessage.error(error instanceof Error ? error.message : '加载需求详情失败')
    } finally {
      detail.loading.value = false
    }
  }

  return {
    ...detail,
    gate,
    binding,
    loadPage,
  }
}
