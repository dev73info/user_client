<script setup lang="ts">
/**
 * 活动奖励的转账单列表与「确认收款」入口。
 * 微信确认页 / 二维码的分支在 `useActivityRewardConfirm`，这里只渲染与转发事件。
 */
import { TButton, TDialog, TTag } from 'ui_73info'

import type { ActivityPayoutItem } from '@/api/activities'
import { activityPayoutStatusLabel } from '@/shared/activity'
import { formatBackendDateTime } from '@/shared/datetime'
import { formatFenAsCny } from '@/shared/money'

withDefaults(
  defineProps<{
    payouts: ActivityPayoutItem[]
    confirming: boolean
    canConfirm: boolean
    confirmLabel: string
    needWechatLogin: boolean
    waitingWechat: boolean
    qrOpen: boolean
    qrImage: string
    qrError: string
    showAction?: boolean
  }>(),
  { showAction: true },
)

defineEmits<{ confirm: []; login: []; 'update:qrOpen': [open: boolean] }>()

function payoutTone(status: ActivityPayoutItem['status']) {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'wait_user_confirm' || status === 'processing') return 'warning'
  return 'neutral'
}
</script>

<template>
  <section class="activity-payouts" aria-label="活动奖励转账单">
    <div class="activity-payouts__head">
      <strong class="wb-subhead">转账单</strong>
      <TButton
        v-if="showAction"
        variant="solid"
        tone="accent"
        :disabled="!canConfirm"
        :loading="confirming"
        @click="$emit('confirm')"
        >{{ confirmLabel }}</TButton
      >
    </div>

    <div v-if="waitingWechat" class="wb-empty" role="status">
      <span class="wb-empty__title">奖励待绑定微信后发放</span>
      <div class="wb-empty__actions">
        <TButton variant="solid" tone="accent" @click="$emit('login')">去微信登录</TButton>
      </div>
    </div>

    <div v-if="needWechatLogin" class="wb-empty" role="alert">
      <span class="wb-empty__title">请先用微信登录后再确认收款</span>
      <div class="wb-empty__actions">
        <TButton variant="solid" tone="accent" @click="$emit('login')">去微信登录</TButton>
      </div>
    </div>

    <ul v-if="payouts.length" class="wb-list" aria-label="转账单明细">
      <li v-for="payout in payouts" :key="payout.out_bill_no" class="wb-item">
        <div class="wb-item__main">
          <span class="wb-item__title">{{ payout.out_bill_no }}</span>
          <span class="wb-item__meta">
            {{ payout.reward_count }} 笔奖励 · {{ formatBackendDateTime(payout.created_at) }}
          </span>
          <span v-if="payout.fail_reason" class="activity-payouts__fail">
            {{ payout.fail_reason }}
          </span>
        </div>
        <div class="wb-item__side">
          <span class="activity-payouts__amount">¥{{ formatFenAsCny(payout.amount_fen) }}</span>
          <TTag :tone="payoutTone(payout.status)" size="sm">
            {{ activityPayoutStatusLabel(payout.status) }}
          </TTag>
        </div>
      </li>
    </ul>
    <p v-else class="wb-empty" role="status">
      <span class="wb-empty__title">暂无转账单</span>
    </p>

    <TDialog
      :open="qrOpen"
      title="微信扫码确认收款"
      width="360px"
      @update:open="$emit('update:qrOpen', $event)"
    >
      <p class="activity-payouts__qr-tip">请在微信中扫码打开本页确认收款</p>
      <div class="activity-payouts__qr">
        <img v-if="qrImage" :src="qrImage" alt="微信扫码确认收款" />
        <span v-else>{{ qrError || '二维码生成中…' }}</span>
      </div>
    </TDialog>
  </section>
</template>

<style scoped>
.activity-payouts {
  display: grid;
  gap: 10px;
}
.activity-payouts__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.activity-payouts__amount {
  color: var(--73-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.activity-payouts__fail {
  color: var(--73-danger-text);
  font-size: 12px;
}
.activity-payouts__qr-tip {
  margin: 0 0 12px;
  color: var(--73-ink-muted);
  font-size: 13px;
  text-align: center;
}
.activity-payouts__qr {
  display: grid;
  place-items: center;
  min-height: 220px;
  color: var(--73-ink-muted);
  font-size: 13px;
}
.activity-payouts__qr img {
  width: 220px;
  height: 220px;
}
</style>
