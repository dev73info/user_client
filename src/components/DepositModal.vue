<script setup lang="ts">
import type { PropType } from 'vue'
import type { ContractSigningStatus } from '@/shared/contracts'
import { formatFenAsCny } from '@/shared/money'

type DepositPayment = Record<string, unknown> | null

defineProps({
  visible: { type: Boolean, default: false },
  depositRequirement: {
    type: Object as PropType<{ title: string; id: string; budget?: number | null }>,
    required: true,
  },
  formattedBudget: { type: String, default: '' },
  paymentStageLabel: { type: String, required: true },
  depositChannel: { type: String as PropType<'alipay' | 'wechat'>, required: true },
  isFinalPayment: { type: Boolean, default: false },
  isEscrowPayment: { type: Boolean, default: false },
  depositRatioPercent: { type: Number, default: 0 },
  depositLoading: { type: Boolean, default: false },
  depositPayment: { type: Object as PropType<DepositPayment>, default: null },
  /**
   * 应付金额（**整数分**）：金额一路以分传递，只有渲染这一步换成元串。
   * 优惠券不参与这块——契约里定金 / 尾款下单接口没有券字段，这里也不展示券。
   */
  payableFen: { type: Number, default: 0 },
  depositPolicyAccepted: { type: Boolean, default: false },
  contractSigningStatus: { type: Object as PropType<ContractSigningStatus | null>, default: null },
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit'): void
  (e: 'update:depositChannel', value: 'alipay' | 'wechat'): void
  (e: 'update:depositPolicyAccepted', value: boolean): void
}>()

function updateChannel(channel: 'alipay' | 'wechat') {
  emit('update:depositChannel', channel)
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
      <p class="deposit-line"><strong>预算：</strong>{{ formattedBudget }}</p>
      <div class="deposit-channel-row">
        <strong>支付方式：</strong>
        <div class="payment-options" role="radiogroup" aria-label="支付方式选择">
          <button
            type="button"
            class="payment-option"
            :class="{
              active: depositChannel === 'alipay',
              'payment-option--alipay': depositChannel === 'alipay',
            }"
            @click="updateChannel('alipay')"
          >
            <img class="payment-option-icon" src="/icons/alipay.png" alt="支付宝" />
            支付宝
          </button>
          <button
            type="button"
            class="payment-option"
            :class="{
              active: depositChannel === 'wechat',
              'payment-option--wechat': depositChannel === 'wechat',
            }"
            @click="updateChannel('wechat')"
          >
            <img class="payment-option-icon" src="/icons/wechat-pay.png" alt="微信" />
            微信
          </button>
        </div>
      </div>
      <p v-if="!isFinalPayment" class="deposit-line">
        <strong>定金占比：</strong>{{ depositRatioPercent.toFixed(2) }}%
      </p>
      <p v-else class="deposit-line">
        <strong>尾款金额：</strong>¥{{ formatFenAsCny(payableFen) }}
      </p>

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
        <div
          class="css-step"
          :class="
            contractSigningStatus?.party_a_signed && contractSigningStatus?.party_b_signed
              ? 'done'
              : 'pending'
          "
        >
          <span class="css-step-dot"></span>
          <span class="css-step-label">可支付定金</span>
        </div>
      </div>

      <div
        v-if="!isFinalPayment"
        class="deposit-policy-box"
        :class="{ 'is-pending': !depositPolicyAccepted, 'is-confirmed': depositPolicyAccepted }"
        role="note"
        aria-label="定金服务费与退款规则"
      >
        <div class="deposit-policy-head">
          <p class="deposit-policy-title">定金服务费说明</p>
          <span
            class="deposit-policy-badge"
            :class="depositPolicyAccepted ? 'is-confirmed' : 'is-required'"
          >
            {{ depositPolicyAccepted ? '已确认' : '必选' }}
          </span>
        </div>
        <ul class="deposit-policy-list">
          <li>该支付仅适用于已启用的电签担保订单，具体金额以双方签署的合同快照为准。</li>
          <li>定金、阶段款或平台服务费的具体用途，以订单页和合同展示为准。</li>
          <li>退款条件按订单状态、合同约定、双方确认情况和《支付与退款说明》处理。</li>
          <li>电签担保订单不支持优惠券抵扣，支付金额由服务端按合同快照计算，下方金额为预估值。</li>
        </ul>
      </div>

      <div
        v-if="!isFinalPayment"
        class="deposit-policy-confirm"
        :class="{ 'is-pending': !depositPolicyAccepted }"
      >
        <label class="deposit-policy-check" :class="{ 'is-checked': depositPolicyAccepted }">
          <input
            class="deposit-policy-check__input"
            type="checkbox"
            :checked="depositPolicyAccepted"
            @change="updateDepositPolicyAccepted(($event.target as HTMLInputElement).checked)"
          />
          <span class="deposit-policy-check__box" aria-hidden="true">
            <span class="deposit-policy-check__tick" />
          </span>
          <span class="deposit-policy-check__text">我已阅读并确认上述电签担保支付与退款规则</span>
        </label>
        <p v-if="!depositPolicyAccepted" class="deposit-policy-warning">未确认前无法支付定金</p>
      </div>

      <p class="deposit-amount">
        实付款：<strong>¥{{ formatFenAsCny(payableFen) }}</strong>
      </p>
      <div class="auth-modal-actions">
        <button class="auth-btn ghost" type="button" @click="emit('close')">取消</button>
        <button
          class="auth-btn solid"
          type="button"
          :disabled="
            depositLoading || (!isFinalPayment && !depositPolicyAccepted && !depositPayment)
          "
          @click="emit('submit')"
        >
          {{
            depositLoading
              ? '处理中...'
              : depositPayment
                ? '查询支付结果'
                : `支付${paymentStageLabel}`
          }}
        </button>
      </div>
    </section>
  </div>
</template>
