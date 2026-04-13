<script setup lang="ts">
import { computed } from 'vue'
import type { PropType } from 'vue'

type DepositCoupon = {
  code: string
  name: string
  discount_type: 'amount' | 'percent'
  min_amount_cny: number
  discount_value: number
  max_discount_cny?: number | null
  [key: string]: unknown
}

type DepositPayment = Record<string, unknown> | null

const props = defineProps({
  visible: { type: Boolean, default: false },
  depositRequirement: { type: Object as PropType<{ title: string; id: string; budget?: number | null }>, required: true },
  formattedBudget: { type: String, default: '' },
  paymentStageLabel: { type: String, required: true },
  depositChannel: { type: String as PropType<'alipay' | 'wechat'>, required: true },
  amountCouponCode: { type: String, default: '' },
  discountCouponCode: { type: String, default: '' },
  isFinalPayment: { type: Boolean, default: false },
  depositRatioPercent: { type: Number, default: 0 },
  couponSummary: { type: String, default: '' },
  availableCoupons: { type: Array as PropType<DepositCoupon[]>, default: () => [] },
  couponLoading: { type: Boolean, default: false },
  depositLoading: { type: Boolean, default: false },
  depositPayment: { type: Object as PropType<DepositPayment>, default: null },
  couponFinalAmount: { type: Number, default: 0 },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'update:depositChannel', value: 'alipay' | 'wechat'): void
  (e: 'selectCoupon', code: string, type: 'amount' | 'percent'): void
  (e: 'loadAvailableCoupons'): void
}>()

const amountCoupons = computed(() => props.availableCoupons.filter((item) => item.discount_type === 'amount'))
const percentCoupons = computed(() => props.availableCoupons.filter((item) => item.discount_type === 'percent'))

function updateChannel(channel: 'alipay' | 'wechat') {
  emit('update:depositChannel', channel)
}

function pickCoupon(code: string, type: 'amount' | 'percent') {
  emit('selectCoupon', code, type)
}
</script>

<template>
  <div v-if="visible" class="auth-modal-wrap" @click.self="emit('close')">
    <section class="auth-modal deposit-card" aria-label="定金支付卡片">
      <h3>支付{{ paymentStageLabel }}</h3>
      <p class="deposit-line"><strong>需求标题：</strong>{{ depositRequirement.title }}</p>
      <p class="deposit-line"><strong>需求编号：</strong>{{ depositRequirement.id }}</p>
      <p class="deposit-line">
        <strong>预算：</strong>{{ formattedBudget }}
      </p>
      <div class="deposit-channel-row">
        <strong>支付方式：</strong>
        <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
          <button type="button" class="payment-option" :class="{ active: depositChannel === 'alipay' }"
            @click="updateChannel('alipay')">
            <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
            支付宝
          </button>
          <button type="button" class="payment-option" :class="{ active: depositChannel === 'wechat' }"
            @click="updateChannel('wechat')">
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信支付" />
            微信支付
          </button>
        </div>
      </div>
      <p v-if="!isFinalPayment" class="deposit-line"><strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%
      </p>
      <p v-else class="deposit-line"><strong>尾款金额：</strong>¥{{ couponFinalAmount.toFixed(2) }}</p>

      <p class="coupon-note">请从下方列表选择优惠券，优惠卷和折扣券只能选其一。</p>
      <p v-if="couponSummary" class="coupon-summary">{{ couponSummary }}</p>

      <div class="coupon-list">
        <div class="coupon-list-header">
          <span>可用优惠券</span>
          <button class="auth-btn ghost" type="button" :disabled="couponLoading" @click="emit('loadAvailableCoupons')">
            {{ couponLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="availableCoupons.length === 0" class="empty">暂无可用优惠券</div>
        <div v-else class="coupon-sections">
          <div class="coupon-section">
            <div class="coupon-section-header">优惠卷</div>
            <div v-if="amountCoupons.length === 0" class="empty">暂无可用优惠卷</div>
            <div v-else class="coupon-items">
              <button v-for="item in amountCoupons" :key="item.code" type="button" class="coupon-item"
                :class="{ active: item.code === amountCouponCode }"
                @click.prevent="pickCoupon(item.code, item.discount_type)">
                <strong>{{ item.name }}</strong>
              </button>
            </div>
          </div>
          <div class="coupon-section">
            <div class="coupon-section-header">折扣券</div>
            <div v-if="percentCoupons.length === 0" class="empty">暂无可用折扣券</div>
            <div v-else class="coupon-items">
              <button v-for="item in percentCoupons" :key="item.code" type="button" class="coupon-item"
                :class="{ active: item.code === discountCouponCode }"
                @click.prevent="pickCoupon(item.code, item.discount_type)">
                <strong>{{ item.name }}</strong>
              </button>
            </div>
          </div>
        </div>
      </div>

      <p class="deposit-amount">
        实付款：<strong>¥{{ couponFinalAmount.toFixed(2) }}</strong>
      </p>
      <div class="auth-modal-actions">
        <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
        <button class="auth-btn solid" type="button" :disabled="depositLoading" @click="emit('submit')">
          {{ depositLoading ? '处理中...' : depositPayment ? '查询支付结果' : `支付${paymentStageLabel}` }}
        </button>
      </div>
    </section>
  </div>
</template>
