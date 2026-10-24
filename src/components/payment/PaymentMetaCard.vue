<script setup lang="ts">
/**
 * 「支付信息」卡片：主语 / 订单号 / 金额 / 优惠券 / 剩余支付时间 + 查单入口。
 *
 * 剩余时间用 `expired` 类变色（样式在 `styles/payment.css` 的 `.meta-list strong.expired`），
 * 截止时间缺失时给一句「以 Adapay 支付机构订单为准」而不是留空。
 */
defineProps<{
  displayRequirementLabel: string
  displayRequirementId: string
  displayOrderNo: string
  displayAmountCny: string
  couponCode: string
  isExpired: boolean
  countdownText: string
  expiresAt: string
  paymentId: string
  isPaymentHandoff: boolean
  confirming: boolean
  confirmationError: string
}>()

const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <article class="meta-card">
    <p class="card-title">支付信息</p>
    <div class="meta-list">
      <p>
        <span>{{ displayRequirementLabel }}</span
        ><strong>{{ displayRequirementId }}</strong>
      </p>
      <p>
        <span>订单号</span><strong>{{ displayOrderNo }}</strong>
      </p>
      <p>
        <span>支付金额</span><strong>¥{{ displayAmountCny }}</strong>
      </p>
      <p v-if="couponCode">
        <span>优惠券</span><strong>{{ couponCode }}</strong>
      </p>
      <p>
        <span>剩余支付时间</span
        ><strong :class="{ expired: isExpired }">{{ countdownText }}</strong>
      </p>
    </div>
    <p class="tip">
      {{
        expiresAt
          ? `支付截止：${expiresAt}（超时后需重新发起支付）`
          : '支付截止时间以 Adapay 支付机构订单为准。'
      }}
    </p>
    <template v-if="paymentId && !isPaymentHandoff">
      <button class="top-back" type="button" :disabled="confirming" @click="emit('confirm')">
        {{ confirming ? '查询中...' : '查询支付结果' }}
      </button>
      <p v-if="confirmationError" class="payment-launch-panel__error" role="alert">
        {{ confirmationError }}
      </p>
    </template>
  </article>
</template>
