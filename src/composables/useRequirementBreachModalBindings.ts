import { computed } from 'vue'

import type { useRequirementBreach } from '@/composables/useRequirementBreach'

type BreachController = ReturnType<typeof useRequirementBreach>

/**
 * 解除合作弹窗的挂点：把 `useRequirementBreach` 的状态与动作铺成一份 `v-bind` 对象。
 *
 * 单独一层是因为那个 composable 已经贴着 300 行上限（逻辑 + 状态），而这里只是**形状转换**：
 * 一次都没改判定，也不发请求。视图因此从「二十来行 props + 十来行监听」收成一行。
 *
 * 契约里没有「申请平台介入」与「AI 判定后接受 / 不接受」，这里也就不再转发那两个动作——
 * 少一个 emit 就少一条能点出 404 的路。
 */
export function useRequirementBreachModalBindings(controller: BreachController) {
  const modalBindings = computed(() => ({
    breachVisible: controller.breachVisible.value,
    breachRequirement: controller.breachRequirement.value,
    breachCase: controller.breachCase.value,
    breachCaseDetail: controller.breachCaseDetail.value,
    breachCaseLoading: controller.breachCaseLoading.value,
    breachLoading: controller.breachLoading.value,
    breachNewRound: controller.breachNewRound.value,
    breachWithdrawnByMe: controller.breachWithdrawnByMe.value,
    breachCanStartNewRound: controller.breachCanStartNewRound.value,
    breachCanRespond: controller.breachCanRespond.value,
    breachCanWithdraw: controller.breachCanWithdraw.value,
    breachWithdrawLoading: controller.breachWithdrawLoading.value,
    breachWithdrawConfirm: controller.breachWithdrawConfirm.value,
    breachDecisionLoading: controller.breachDecisionLoading.value,
    breachReason: controller.breachReason.value,
    breachDecisionNote: controller.breachDecisionNote.value,
    'onUpdate:breachReason': (value: string) => {
      controller.breachReason.value = value
    },
    'onUpdate:breachDecisionNote': (value: string) => {
      controller.breachDecisionNote.value = value
    },
    onClose: controller.closeBreachReport,
    onSubmitReport: controller.submitBreachReport,
    onOpenWithdrawConfirm: controller.openBreachWithdrawConfirm,
    onCancelWithdrawConfirm: controller.cancelBreachWithdrawConfirm,
    onSubmitWithdraw: controller.submitBreachWithdraw,
    onReopen: controller.reopenBreachReport,
    onSubmitDecision: controller.submitBreachDecision,
  }))

  return { modalBindings }
}
