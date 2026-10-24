<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AcceptanceDialog from '@/components/AcceptanceDialog.vue'
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import ConversationBreachDialog from '@/components/conversation/ConversationBreachDialog.vue'
import DeliverySubmitDialog from '@/components/DeliverySubmitDialog.vue'
import DepositModal from '@/components/DepositModal.vue'
import { useAuthStore } from '@/stores/auth'
import { useConversationActionCommands } from '@/composables/useConversationActionCommands'
import { useConversationActionState } from '@/composables/useConversationActionState'
import { useConversationPayment } from '@/composables/useConversationPayment'

type ViewerRole = 'customer' | 'developer'

/**
 * chip 的三种视觉重量：
 *   - `default`：普通入口（如「查看合同」），白底描边；
 *   - `primary`：**当前该做的那一步**（如「支付定金」「发起合同」），实心主色；
 *   - `accent`：值得留意、但不是人人都要走的一步，浅蓝描边突出；
 *   - `warning`：会改变合作关系、需要想清楚再点的入口（结单前后的「解除合作」），橙色底与描边；
 *   - `danger`：不可挽回的破坏性动作，红色描边。
 */
type ActionTone = 'default' | 'primary' | 'danger' | 'accent' | 'warning'

type ActionChip = {
  key: string
  label: string
  tone: ActionTone
  run: () => void
}

/** 会话中当前用户在需求上的身份：甲方（需求方）/ 乙方（开发者）。 */
const props = defineProps<{
  token: string
  requirementId: string
  role: ViewerRole
}>()

/** 会话卡片要跟着工具条的能力开关走；用事件推出去，父组件才能响应式更新。 */
export type ActionCapabilities = {
  canAcceptDelivery: boolean
  canDeliver: boolean
  canPay: boolean
}

const emit = defineEmits<{
  changed: []
  capabilities: [caps: ActionCapabilities]
}>()

const auth = useAuthStore()

/**
 * 取数与可用性判断（需求单、合同签署状态、定金比例、解除合作案件）在 useConversationActionState 里；
 * 支付弹窗与下单跳转在 useConversationPayment 里；合同 / 验收 / 交付 / 确认完成这些命令在
 * useConversationActionCommands 里。这里只留「哪一步现在能做」的编排与弹窗的摆位。
 */
const {
  requirement,
  signing,
  breachCase,
  depositRatioPercent,
  isDeveloper,
  myPartySigned,
  hasContract,
  hasBoundResource,
  canCreateContract,
  canOpenContract,
  canPayDeposit,
  canPayFinal,
  canPay,
  canRequestFinal,
  canAcceptDelivery,
  canDeliver,
  canCureFinalPay,
  canUseBreach,
  canUseAfterSales,
  applyPublishedVersionCount,
  loadActions,
  refreshBreachCase,
} = useConversationActionState(() => ({
  token: props.token,
  requirementId: props.requirementId,
  role: props.role,
}))

const {
  payVisible,
  payLoading,
  depositPolicyAccepted,
  payChannel,
  payStage,
  payAmount,
  openPayDialog,
  updatePayChannel,
  submitPayment,
} = useConversationPayment(() => ({
  token: props.token,
  requirement: requirement.value,
  depositRatioPercent: depositRatioPercent.value,
}))

const {
  actingKey,
  deliveryVisible,
  acceptanceVisible,
  afterSalesVisible,
  createContract,
  openContract,
  openAcceptanceDialog,
  closeAcceptanceDialog,
  handleAcceptanceSubmitted,
  requestFinalPayment,
  cureFinalPayment,
  openDeliveryDialog,
  handleDeliverySubmitted,
  openAfterSalesDialog,
} = useConversationActionCommands(() => ({
  token: props.token,
  requirement: requirement.value,
  setRequirement: (value) => {
    requirement.value = value
  },
  isDeveloper: isDeveloper.value,
  myPartySigned: myPartySigned.value,
  hasBoundResource: hasBoundResource.value,
  canPayFinal: canPayFinal.value,
  openPayDialog,
  loadActions,
  onChanged: () => emit('changed'),
}))

/** 解除合作弹窗：开窗时请它自己重拉一次案件（缓存一份反而会显示上一轮的结果）。 */
const breachDialogRef = ref<InstanceType<typeof ConversationBreachDialog> | null>(null)

/** 按当前身份与需求状态给出可用操作；顺序即业务流程顺序。 */
const chips = computed<ActionChip[]>(() => {
  if (!requirement.value) {
    return []
  }

  const list: ActionChip[] = []

  if (canCreateContract.value) {
    list.push({
      key: 'create-contract',
      label: '发起合同',
      tone: 'primary',
      run: () => void createContract(),
    })
  }
  if (canOpenContract.value) {
    list.push({
      key: 'contract',
      label: myPartySigned.value ? '查看合同' : '签署合同',
      tone: myPartySigned.value ? 'default' : 'primary',
      run: () => void openContract(),
    })
  }
  if (canPayDeposit.value) {
    list.push({ key: 'pay', label: '支付定金', tone: 'primary', run: openPayDialog })
  }
  if (canPayFinal.value) {
    list.push({ key: 'pay', label: '支付尾款', tone: 'primary', run: openPayDialog })
  }
  if (canCureFinalPay.value) {
    list.push({
      key: 'final-pay-cure',
      label: '催告付款',
      tone: 'default',
      run: () => void cureFinalPayment(),
    })
  }
  if (canRequestFinal.value) {
    list.push({
      key: 'request-final',
      label: '确认完成',
      tone: 'primary',
      run: () => void requestFinalPayment(),
    })
  }
  if (canAcceptDelivery.value) {
    list.push({
      key: 'acceptance',
      label: '验收',
      // 待付尾款时当前该做的是「支付尾款」，验收退成次要入口；开发中则验收正是那一步。
      tone: canPayFinal.value ? 'default' : 'primary',
      run: openAcceptanceDialog,
    })
  }
  if (canDeliver.value) {
    list.push({ key: 'deliver', label: '交付版本', tone: 'primary', run: openDeliveryDialog })
  }
  if (canUseBreach.value) {
    list.push({
      key: 'termination',
      label: '解除合作',
      tone: 'warning',
      run: () => void breachDialogRef.value?.openBreachDialog(),
    })
  }
  if (canUseAfterSales.value) {
    // 用 `accent` 而不是 `primary`：实心主色是「现在该做这一步」的意思（支付定金、发起合同），
    // 而结单后并不总有事要做——没有在办案件时它只是一个入口，占了主色会把「查看合同」压下去，
    // 也和这一排其它入口不是一套语言。
    list.push({ key: 'after-sales', label: '解除合作', tone: 'warning', run: openAfterSalesDialog })
  }
  return list
})

watch(
  () => [props.token, props.requirementId, props.role] as const,
  () => {
    void loadActions()
  },
  { immediate: true },
)

/** 能力一变就通知会话容器：卡片上的「验收 / 去交付 / 支付」靠这份快照，不能只读 expose 的 computed（父组件不会跟踪子组件内部依赖）。 */
watch(
  [canAcceptDelivery, canDeliver, canPay],
  () => {
    emit('capabilities', {
      canAcceptDelivery: canAcceptDelivery.value,
      canDeliver: canDeliver.value,
      canPay: canPay.value,
    })
  },
  { immediate: true },
)

function onBreachCaseChanged(value: NonNullable<typeof breachCase.value>) {
  breachCase.value = value
}

function chipClass(chip: ActionChip) {
  return `conversation-actions__chip--${chip.tone}`
}

function formatBudget(value?: number | null) {
  if (value == null) {
    return '待议价'
  }
  return `¥${value.toFixed(2)}`
}

/**
 * 给会话容器用的入口。会话卡片（「合同已签署完成」「验收已通过」「收到交付版本」等）也要
 * 挂「支付定金 / 支付尾款」「验收」「去交付」，但能不能做、以及弹窗归谁管，都以工具条
 * 这份判断为准——卡片那边只负责把入口摆在卡片上。两处共用同一组 computed 与同一组弹窗，
 * 条件不会各写一套而走偏。
 */
defineExpose({
  canAcceptDelivery,
  openAcceptanceDialog,
  canDeliver,
  openDeliveryDialog,
  canPay,
  openPayDialog,
  loadActions,
  applyPublishedVersionCount,
})
</script>

<template>
  <div v-if="chips.length > 0" class="conversation-actions" role="group" aria-label="需求快捷操作">
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      class="conversation-actions__chip"
      :class="chipClass(chip)"
      :disabled="Boolean(actingKey)"
      @click="chip.run()"
    >
      {{ actingKey === chip.key ? '处理中...' : chip.label }}
    </button>
  </div>

  <!-- 结单后的解除合作：入口只在担保模式且需求已完成时出现，弹窗自己负责案件列表、诉求与表态。 -->
  <AfterSalesModal
    v-if="requirement"
    :visible="afterSalesVisible"
    :token="token"
    :current-username="auth.username"
    :requirement-id="requirement.requirement_id"
    :requirement-title="requirement.title"
    :requirement-budget="requirement.budget"
    :can-open-case="!isDeveloper"
    @close="afterSalesVisible = false"
  />

  <DepositModal
    v-if="payVisible && requirement"
    :visible="payVisible"
    :deposit-requirement="{
      title: requirement.title,
      id: requirement.requirement_id,
      budget: requirement.budget,
    }"
    :formatted-budget="formatBudget(requirement.budget)"
    :payment-stage-label="payStage === 'final' ? '尾款' : '定金'"
    :deposit-channel="payChannel"
    :is-final-payment="payStage === 'final'"
    :is-escrow-payment="true"
    :deposit-ratio-percent="depositRatioPercent"
    :coupon-final-amount="payAmount"
    :deposit-loading="payLoading"
    :deposit-policy-accepted="depositPolicyAccepted"
    :contract-signing-status="signing"
    @close="payVisible = false"
    @submit="submitPayment"
    @update:depositChannel="updatePayChannel"
    @update:depositPolicyAccepted="depositPolicyAccepted = $event"
  />

  <DeliverySubmitDialog
    v-model:visible="deliveryVisible"
    :token="token"
    :bound-resource-id="requirement?.bound_resource_id ?? null"
    @submitted="handleDeliverySubmitted"
  />

  <AcceptanceDialog
    :visible="acceptanceVisible"
    :token="token"
    :requirement-id="requirement?.requirement_id ?? ''"
    :requirement-title="requirement?.title ?? ''"
    @close="closeAcceptanceDialog"
    @submitted="handleAcceptanceSubmitted"
  />

  <!-- 解除合作（在办案件与新一轮申报）：整块在 ConversationBreachDialog 里，入口点它开窗。 -->
  <ConversationBreachDialog
    ref="breachDialogRef"
    :token="token"
    :requirement-id="requirementId"
    :case="breachCase"
    :is-developer="isDeveloper"
    :requirement-title="requirement?.title"
    :has-contract="hasContract"
    @changed="emit('changed')"
    @case-changed="onBreachCaseChanged"
    @refresh="refreshBreachCase"
  />
</template>

<style scoped src="./conversation/conversation-actions.css"></style>
