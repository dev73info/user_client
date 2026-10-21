<script setup lang="ts">
import { CircleCheck, Clock } from 'ui_73info'

/**
 * 支付结果区：「已到账」与「微信已返回成功」两种态共用一块。
 *
 * 两者语义不同——`paid` 是平台确认收款，`wechatSubmitted` 只说明微信回调成功、
 * 到账仍以电脑端订单为准——所以文案必须分开写，不能统一成「支付成功」。
 */
defineProps<{
  paid: boolean
  isPaymentHandoff: boolean
  isWechatMiddlePage: boolean
  paymentId: string
  displayOrderNo: string
  displayAmountCny: string
  confirmationError: string
  confirming: boolean
  redirectCountdown: number
}>()

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <div class="payment-result" role="status" aria-live="polite">
    <CircleCheck
      v-if="paid"
      class="payment-result__icon payment-result__icon--success"
      aria-hidden="true"
    />
    <Clock v-else class="payment-result__icon" aria-hidden="true" />
    <h2>{{ paid ? '支付成功' : isPaymentHandoff ? '微信已返回支付成功' : '正在确认支付结果' }}</h2>
    <p>
      {{
        paid
          ? '平台已确认收款。'
          : isPaymentHandoff
            ? '平台到账状态以电脑端订单为准，请勿重复付款。'
            : '微信付款已完成，平台到账确认中，请勿重复付款。'
      }}
    </p>
    <p>订单号：{{ isWechatMiddlePage ? displayOrderNo : paymentId }}</p>
    <p v-if="displayAmountCny">支付金额：¥{{ displayAmountCny }}</p>
    <p v-if="confirmationError" class="payment-launch-panel__error">{{ confirmationError }}</p>
    <button
      v-if="!paid && !isPaymentHandoff"
      class="payment-launch-panel__button"
      type="button"
      :disabled="confirming"
      @click="emit('confirm')"
    >
      {{ confirming ? '查询中...' : '查询支付结果' }}
    </button>
    <p v-if="paid" class="payment-result__countdown">{{ redirectCountdown }} 秒后自动返回…</p>
  </div>
</template>
