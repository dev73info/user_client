<script setup lang="ts">
import type { RequirementItem } from '@/api/requirements'
import { cancelConfirmHint } from '@/shared/requirementRowRules'

/**
 * 两个 `.pay-modal` 确认弹窗：无担保需求的「确认完成」与「取消需求单」。
 *
 * 纯展示：入口守卫（能不能确认完成 / 能不能取消）与请求都在视图，这里只 emit。
 *
 * 关于「确认完成」：它**不属于支付流程**——担保需求的尾款走验收 → 支付弹窗
 * （`useRequirementPayFlow` + `RequirementPayModal`），这里只剩无担保需求的收尾动作。
 * 所以这套标题 / 提示文案跟着本组件走，不要挪进支付域。
 *
 * 样式全部来自全局的 `.modal-wrap` / `.pay-modal`（见 `styles/modal.css`），组件不带样式块。
 */
const props = defineProps<{
  finalPaymentVisible: boolean
  finalPaymentTarget: RequirementItem | null
  /** 确认完成请求在跑：两个按钮置灰，文案不变（与取消 / 认领两个弹窗一致，只挡重复提交）。 */
  finalPaymentLoading: boolean
  cancelVisible: boolean
  cancelTarget: RequirementItem | null
  cancelLoading: boolean
}>()

const emit = defineEmits<{
  closeFinalPayment: []
  confirmFinalPayment: []
  closeCancel: []
  confirmCancel: []
}>()

/* 「确认完成」的三段文案原样搬过来（原来是视图里的三个 computed 常量）。 */
const finalPaymentTitle = '确认交付完成'
const finalPaymentTip = '确认后，当前需求会直接进入已完成状态，后续可继续评价。'
const finalPaymentButton = '确认完成'
</script>

<template>
  <div
    v-if="props.finalPaymentVisible && props.finalPaymentTarget"
    class="modal-wrap"
    @click.self="emit('closeFinalPayment')"
  >
    <!-- aria-label 沿用原来那串（历史文案，指这一族「结单前确认」弹窗），只改实现不改文案。 -->
    <section class="pay-modal" aria-label="尾款确认弹窗">
      <h3>{{ finalPaymentTitle }}</h3>
      <p class="pay-line"><strong>需求标题：</strong>{{ props.finalPaymentTarget.title }}</p>
      <p class="pay-line">
        <strong>需求编号：</strong>{{ props.finalPaymentTarget.requirement_id }}
      </p>
      <p class="tip">{{ finalPaymentTip }}</p>

      <div class="actions">
        <button
          class="ghost"
          type="button"
          :disabled="props.finalPaymentLoading"
          @click="emit('closeFinalPayment')"
        >
          取消
        </button>
        <button
          class="ghost primary"
          type="button"
          :disabled="props.finalPaymentLoading"
          @click="emit('confirmFinalPayment')"
        >
          {{ finalPaymentButton }}
        </button>
      </div>
    </section>
  </div>

  <div
    v-if="props.cancelVisible && props.cancelTarget"
    class="modal-wrap"
    @click.self="emit('closeCancel')"
  >
    <section class="pay-modal" aria-label="取消需求弹窗">
      <h3>取消需求单</h3>
      <p class="pay-line"><strong>需求标题：</strong>{{ props.cancelTarget.title }}</p>
      <p class="pay-line"><strong>需求编号：</strong>{{ props.cancelTarget.requirement_id }}</p>
      <p class="tip">{{ cancelConfirmHint(props.cancelTarget) }}</p>

      <div class="actions">
        <button
          class="ghost"
          type="button"
          :disabled="props.cancelLoading"
          @click="emit('closeCancel')"
        >
          返回
        </button>
        <button
          class="ghost danger"
          type="button"
          :disabled="props.cancelLoading"
          @click="emit('confirmCancel')"
        >
          {{ props.cancelLoading ? '取消中...' : '确认取消' }}
        </button>
      </div>
    </section>
  </div>
</template>
