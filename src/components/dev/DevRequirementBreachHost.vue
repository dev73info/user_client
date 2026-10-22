<script setup lang="ts">
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import { useBreachCase } from '@/composables/useBreachCase'
import { canReportBreach } from '@/shared/devMyRequirementCard'

import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'

/**
 * 解除合作案件的挂点：编排层（`useBreachCase`）、判定与弹窗都在这一处，
 * 页面只通过暴露的 `open(item)` 按行拉起，不再持有案件状态。
 *
 * 签约状态**注入**进来（`contractOf` 读页面那份一次取回的签约状态），弹窗与卡片因此共用
 * 同一份「有没有生效合同」的事实——在别处再查一次就是第二套口径。
 */
const props = defineProps<{
  token: string
  username: string
  contractOf: (item: RequirementItem) => ContractSigningStatus | null
}>()

const {
  breachVisible,
  breachReason,
  breachLoading,
  breachCase,
  breachCaseLoading,
  breachNewRound,
  platformReviewLoading,
  breachWithdrawLoading,
  breachWithdrawConfirm,
  breachDecisionLoading,
  breachRejectPanel,
  breachDecisionNote,
  breachWithdrawnByMe,
  breachCanRespond,
  breachCanWithdraw,
  breachCanDecide,
  breachCanStartNewRound,
  openBreachReport,
  closeBreachReport,
  submitPlatformReview,
  openBreachWithdrawConfirm,
  cancelBreachWithdrawConfirm,
  submitBreachWithdraw,
  reopenBreachReport,
  openBreachRejectPanel,
  cancelBreachRejectPanel,
  submitBreachDecision,
  submitBreachReport,
} = useBreachCase({
  token: () => props.token,
  username: () => props.username,
  contractOf: (item) => props.contractOf(item),
})

/** 解除合作入口：能不能申报由这里判定（要读一次取回的签约状态）。 */
function open(item: RequirementItem) {
  if (!canReportBreach(item, props.contractOf(item))) {
    return
  }
  void openBreachReport(item)
}

defineExpose({ open })
</script>

<template>
  <!-- 解除合作案件弹窗：编排在 `useBreachCase`，组件只渲染、只 emit。
       签约状态（`breachCanStartNewRound`）由页面注入，弹窗不再自己查一次。 -->
  <RequirementBreachDialog
    v-model:visible="breachVisible"
    v-model:reason="breachReason"
    v-model:decision-note="breachDecisionNote"
    :breach-case="breachCase"
    :case-loading="breachCaseLoading"
    :new-round="breachNewRound"
    :report-loading="breachLoading"
    :platform-review-loading="platformReviewLoading"
    :withdraw-loading="breachWithdrawLoading"
    :withdraw-confirm="breachWithdrawConfirm"
    :decision-loading="breachDecisionLoading"
    :reject-panel="breachRejectPanel"
    :withdrawn-by-me="breachWithdrawnByMe"
    :can-start-new-round="breachCanStartNewRound"
    :can-respond="breachCanRespond"
    :can-withdraw="breachCanWithdraw"
    :can-decide="breachCanDecide"
    @close="closeBreachReport"
    @submit-report="submitBreachReport"
    @submit-platform-review="submitPlatformReview"
    @open-withdraw-confirm="openBreachWithdrawConfirm"
    @cancel-withdraw-confirm="cancelBreachWithdrawConfirm"
    @submit-withdraw="submitBreachWithdraw"
    @reopen="reopenBreachReport"
    @open-reject-panel="openBreachRejectPanel"
    @cancel-reject-panel="cancelBreachRejectPanel"
    @submit-decision="submitBreachDecision"
  />
</template>
