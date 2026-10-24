<script setup lang="ts">
import RequirementBreachDialog from '@/components/dev/RequirementBreachDialog.vue'
import { useRequirementBreach } from '@/composables/useRequirementBreach'
import { canReportBreach } from '@/shared/devMyRequirementCard'

import type { ContractSigningStatus } from '@/api/contracts'
import type { RequirementItem } from '@/api/devRequirements'

/**
 * 解除合作案件的挂点：编排层（`useRequirementBreach`）、判定与弹窗都在这一处，
 * 页面只通过暴露的 `open(item)` 按行拉起，不再持有案件状态。
 *
 * 编排层与需求方那一侧**是同一个**（`composables/useRequirementBreach`）：同一条后端案件、
 * 同一套契约字段，两侧只在「我是谁」上不同——身份由注入的用户名决定，不再各写一份状态机。
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
  breachCaseDetail,
  breachCaseLoading,
  breachNewRound,
  breachWithdrawLoading,
  breachWithdrawConfirm,
  breachDecisionLoading,
  breachDecisionNote,
  breachWithdrawnByMe,
  breachCanRespond,
  breachCanWithdraw,
  breachCanStartNewRound,
  openBreachReport,
  closeBreachReport,
  openBreachWithdrawConfirm,
  cancelBreachWithdrawConfirm,
  submitBreachWithdraw,
  reopenBreachReport,
  submitBreachDecision,
  submitBreachReport,
} = useRequirementBreach({
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
  <!-- 解除合作案件弹窗：编排在 `useRequirementBreach`，组件只渲染、只 emit。
       签约状态（`breachCanStartNewRound`）由页面注入，弹窗不再自己查一次。 -->
  <RequirementBreachDialog
    v-model:visible="breachVisible"
    v-model:reason="breachReason"
    v-model:decision-note="breachDecisionNote"
    :breach-case="breachCase"
    :breach-case-detail="breachCaseDetail"
    :case-loading="breachCaseLoading"
    :new-round="breachNewRound"
    :report-loading="breachLoading"
    :withdraw-loading="breachWithdrawLoading"
    :withdraw-confirm="breachWithdrawConfirm"
    :decision-loading="breachDecisionLoading"
    :withdrawn-by-me="breachWithdrawnByMe"
    :can-start-new-round="breachCanStartNewRound"
    :can-respond="breachCanRespond"
    :can-withdraw="breachCanWithdraw"
    @close="closeBreachReport"
    @submit-report="submitBreachReport"
    @open-withdraw-confirm="openBreachWithdrawConfirm"
    @cancel-withdraw-confirm="cancelBreachWithdrawConfirm"
    @submit-withdraw="submitBreachWithdraw"
    @reopen="reopenBreachReport"
    @submit-decision="submitBreachDecision"
  />
</template>
