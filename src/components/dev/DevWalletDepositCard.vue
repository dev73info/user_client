<script setup lang="ts">
/**
 * 「保证金余额」卡：可提现保证金大数、冻结/退款处理中/提现处理中三档状态、
 * 信用额度（启用封顶时）与两个出口（提现保证金 / 充值）。
 *
 * 保证金是接单资格的押金，与「接单收入」是两个互不相通的池子——这里只读
 * `useDevWalletDeposit` 的投影，充值、提现两个动作都只 `emit` 出去，弹窗与回刷在页面。
 *
 * 样式走全局 `styles/dev-wallet.css` 的 `.wallet-hero*`，本组件不带 style 块。
 */
import type { DevOrderDepositStatus, DevOrderDepositWithdrawalSummary } from '@/api/devOrderDeposit'
import type { DevCreditSelf } from '@/api/devCredit'
import { money } from '@/shared/devFundDisplay'

import { TButton, TCard, TIcon, TTag, Wallet } from 'ui_73info'

const props = defineProps<{
  /** 可提现保证金（退回台账上的口径） */
  withdrawable: number
  /** 已支付的充值总额 */
  totalPaid: number
  /** 保证金状态：冻结、退款处理中从这里取 */
  status: DevOrderDepositStatus | null
  /** 保证金提现台账：处理中的出款额从这里取 */
  summary: DevOrderDepositWithdrawalSummary | null
  /** 信用额度（只在启用保证金封顶时展示） */
  credit: DevCreditSelf | null
  /** 可提现保证金是否达到提现门档 */
  canWithdraw: boolean
  /** 保证金池加载中（提现按钮的转圈） */
  loading: boolean
}>()

const emit = defineEmits<{
  /** 打开保证金提现弹窗 */
  withdraw: []
  /** 打开保证金充值弹窗 */
  recharge: []
}>()
</script>

<template>
  <TCard class="dev-surface-card wallet-hero__card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">保证金余额</h3>
      </div>
      <div class="dev-card-head__actions">
        <TTag variant="outline" tone="info">充值总额 {{ money(props.totalPaid) }}</TTag>
      </div>
    </div>
    <div class="wallet-hero__body">
      <div class="wallet-hero__main">
        <span class="dev-figure" :class="{ 'dev-figure--muted': !props.canWithdraw }">
          {{ money(props.withdrawable) }}
        </span>
      </div>
      <div class="wallet-hero__tags">
        <TTag variant="outline" v-if="(props.status?.frozen_cny ?? 0) > 0" tone="warning">
          冻结中 {{ money(props.status?.frozen_cny) }}
        </TTag>
        <TTag variant="outline" v-if="(props.status?.pending_refund_cny ?? 0) > 0" tone="warning">
          退款处理中 {{ money(props.status?.pending_refund_cny) }}
        </TTag>
        <TTag
          variant="outline"
          v-if="(props.summary?.pending_withdraw_cny ?? 0) > 0"
          tone="warning"
        >
          处理中 {{ money(props.summary?.pending_withdraw_cny) }}
        </TTag>
        <TTag variant="outline" :tone="props.canWithdraw ? 'success' : 'info'">
          {{ props.canWithdraw ? '满足提现条件' : '不满足提现条件' }}
        </TTag>
        <TTag
          variant="outline"
          v-if="props.credit && props.credit.enforce_deposit_limit"
          tone="accent"
        >
          信用 {{ props.credit.credit_score.toFixed(2) }} · 剩余可充
          {{ money(props.credit.remaining_deposit_cap_cny) }}
        </TTag>
      </div>
    </div>
    <div class="wallet-hero__footer">
      <TButton
        variant="solid"
        tone="accent"
        :disabled="!props.canWithdraw"
        :loading="props.loading"
        @click="emit('withdraw')"
      >
        <TIcon v-if="!props.loading">
          <Wallet />
        </TIcon>
        <span>提现保证金</span>
      </TButton>
      <TButton variant="outline" @click="emit('recharge')">
        <TIcon><Wallet /></TIcon>
        <span>充值</span>
      </TButton>
    </div>
  </TCard>
</template>
