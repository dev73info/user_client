import { computed } from 'vue'

import type { useRequirementBreach } from '@/composables/useRequirementBreach'

type BreachController = ReturnType<typeof useRequirementBreach>

type UseRequirementBreachModalBindingsOptions = {
  /** 「去账号中心绑收款银行卡」：路由留在视图，注入成回调。 */
  onGoSettlementAccount: () => void
}

/**
 * 解除合作弹窗的挂点：把 `useRequirementBreach` 的状态与动作铺成一份 `v-bind` 对象。
 *
 * 单独一层是因为那个 composable 已经贴着 300 行上限（逻辑 + 状态），而这里只是**形状转换**：
 * 一次都没改判定，也不发请求。视图因此从「二十来行 props + 十来行监听」收成一行。
 *
 * `bindSettlement` 的两个动作有先后：先按常规口径关弹窗（此时没有请求在跑，
 * `closeBreachReport` 的 loading 守卫不会拦住它），再由视图跳账号中心。
 */
export function useRequirementBreachModalBindings(
  controller: BreachController,
  options: UseRequirementBreachModalBindingsOptions,
) {
  const modalBindings = computed(() => ({
    breachVisible: controller.breachVisible.value,
    breachRequirement: controller.breachRequirement.value,
    breachCase: controller.breachCase.value,
    breachCaseLoading: controller.breachCaseLoading.value,
    breachLoading: controller.breachLoading.value,
    breachNewRound: controller.breachNewRound.value,
    breachWithdrawnByMe: controller.breachWithdrawnByMe.value,
    breachCanStartNewRound: controller.breachCanStartNewRound.value,
    breachCanRespond: controller.breachCanRespond.value,
    breachCanWithdraw: controller.breachCanWithdraw.value,
    platformReviewLoading: controller.platformReviewLoading.value,
    breachWithdrawLoading: controller.breachWithdrawLoading.value,
    breachWithdrawConfirm: controller.breachWithdrawConfirm.value,
    breachDecisionLoading: controller.breachDecisionLoading.value,
    breachRejectPanel: controller.breachRejectPanel.value,
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
    onSubmitPlatformReview: controller.submitPlatformReview,
    onOpenWithdrawConfirm: controller.openBreachWithdrawConfirm,
    onCancelWithdrawConfirm: controller.cancelBreachWithdrawConfirm,
    onSubmitWithdraw: controller.submitBreachWithdraw,
    onReopen: controller.reopenBreachReport,
    onOpenRejectPanel: controller.openBreachRejectPanel,
    onCancelRejectPanel: controller.cancelBreachRejectPanel,
    onSubmitDecision: controller.submitBreachDecision,
    onBindSettlement: () => {
      controller.closeBreachReport()
      options.onGoSettlementAccount()
    },
  }))

  return { modalBindings }
}
