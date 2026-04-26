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

type ContractSigningStatus = {
  has_contract: boolean
  party_b_signed: boolean
  party_a_signed: boolean
}

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
  depositPolicyAccepted: { type: Boolean, default: false },
  contractSigningStatus: { type: Object as PropType<ContractSigningStatus | null>, default: null },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'update:depositChannel', value: 'alipay' | 'wechat'): void
  (e: 'selectCoupon', code: string, type: 'amount' | 'percent'): void
  (e: 'loadAvailableCoupons'): void
  (e: 'update:depositPolicyAccepted', value: boolean): void
}>()

const amountCoupons = computed(() => props.availableCoupons.filter((item) => item.discount_type === 'amount'))
const percentCoupons = computed(() => props.availableCoupons.filter((item) => item.discount_type === 'percent'))

function updateChannel(channel: 'alipay' | 'wechat') {
  emit('update:depositChannel', channel)
}

function pickCoupon(code: string, type: 'amount' | 'percent') {
  emit('selectCoupon', code, type)
}

function updateDepositPolicyAccepted(value: boolean) {
  emit('update:depositPolicyAccepted', value)
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

      <div v-if="!isFinalPayment" class="contract-signing-status">
        <div class="css-step" :class="contractSigningStatus?.has_contract ? 'done' : 'pending'">
          <span class="css-step-dot"></span>
          <span class="css-step-label">协议已创建</span>
        </div>
        <span class="css-step-line"></span>
        <div class="css-step" :class="contractSigningStatus?.party_b_signed ? 'done' : 'pending'">
          <span class="css-step-dot"></span>
          <span class="css-step-label">乙方（开发者）已签</span>
        </div>
        <span class="css-step-line"></span>
        <div class="css-step" :class="contractSigningStatus?.party_a_signed ? 'done' : 'pending'">
          <span class="css-step-dot"></span>
          <span class="css-step-label">甲方（您）已签</span>
        </div>
        <span class="css-step-line"></span>
        <div class="css-step"
          :class="contractSigningStatus?.party_a_signed && contractSigningStatus?.party_b_signed ? 'done' : 'pending'">
          <span class="css-step-dot"></span>
          <span class="css-step-label">可支付定金</span>
        </div>
      </div>

      <div v-if="!isFinalPayment" class="deposit-policy-box"
        :class="{ 'is-pending': !depositPolicyAccepted, 'is-confirmed': depositPolicyAccepted }" role="note"
        aria-label="定金服务费与退款规则">
        <div class="deposit-policy-head">
          <p class="deposit-policy-title">定金服务费说明</p>
          <span class="deposit-policy-badge" :class="depositPolicyAccepted ? 'is-confirmed' : 'is-required'">
            {{ depositPolicyAccepted ? '已确认' : '必选' }}
          </span>
        </div>
        <ul class="deposit-policy-list">
          <li>定金为支付给平台的服务费，用于撮合与服务保障。</li>
          <li>若无人接单，可退 100%。</li>
          <li>若有人接单后放弃，且最终仍无人接单，可退 50%。</li>
        </ul>
      </div>

      <div v-if="!isFinalPayment" class="deposit-policy-confirm" :class="{ 'is-pending': !depositPolicyAccepted }">
        <label class="deposit-policy-check" :class="{ 'is-checked': depositPolicyAccepted }">
          <input class="deposit-policy-check__input" type="checkbox" :checked="depositPolicyAccepted"
            @change="updateDepositPolicyAccepted(($event.target as HTMLInputElement).checked)" />
          <span class="deposit-policy-check__box" aria-hidden="true">
            <span class="deposit-policy-check__tick" />
          </span>
          <span class="deposit-policy-check__text">我已阅读并确认上述定金服务费与退款规则</span>
        </label>
        <p v-if="!depositPolicyAccepted" class="deposit-policy-warning">未确认前无法支付定金</p>
      </div>

      <p v-if="couponSummary" class="coupon-summary">{{ couponSummary }}</p>

      <div v-if="!isFinalPayment" class="coupon-list">
        <div class="coupon-list-header">
          <span>可用优惠券</span>
          <button class="auth-btn ghost" type="button" :disabled="couponLoading" @click="emit('loadAvailableCoupons')">
            {{ couponLoading ? '刷新中...' : '刷新' }}
          </button>
        </div>
        <div v-if="availableCoupons.length === 0" class="empty">暂无可用优惠券</div>
        <div v-else class="coupon-sections">
          <div class="coupon-section">
            <div class="coupon-section-header">优惠券</div>
            <div v-if="amountCoupons.length === 0" class="empty">暂无可用优惠券</div>
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
        <button class="auth-btn solid" type="button"
          :disabled="depositLoading || (!isFinalPayment && !depositPolicyAccepted && !depositPayment)"
          @click="emit('submit')">
          {{ depositLoading ? '处理中...' : depositPayment ? '查询支付结果' : `支付${paymentStageLabel}` }}
        </button>
      </div>
    </section>
  </div>
</template>
