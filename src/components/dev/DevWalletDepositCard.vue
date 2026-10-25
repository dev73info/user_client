<script setup lang="ts">
/**
 * 「保证金余额」卡：可提现保证金大数、冻结/退款处理中/提现处理中三档状态、
 * 信用额度（启用封顶时）与两个出口（提现保证金 / 充值）。
 *
 * 保证金是接单资格的押金，与「接单收入」是两个互不相通的池子——这里只读
 * `useDevWalletDeposit` 的投影，充值、提现两个动作都只 `emit` 出去，弹窗与回刷在页面。
 *
 * 样式走全局 `styles/dev-wallet.css` 的 `.wallet-hero*`，本组件不带 style 块：
 * 两张卡的骨架（卡头 / 大数 / 标签行 / 分隔线 / 操作区）全靠那一份共享样式对齐，
 * 本卡不要自带 padding、border、width——`styles/modal/10-deposit-card-modal-actions.css`
 * 里定金支付弹窗占着 `.deposit-card` 这个名字（`width: min(540px, 100%)`），撞上就会被限成半宽；
 * 也不要用 `--el-*` 令牌，那套变量在本应用没有定义，描边会塌成 0、背景变透明。
 */
import { computed } from 'vue'

import type { DevCreditSelf } from '@/api/devCredit'
import { toYuan, type DepositReading } from '@/composables/useDevWalletDeposit'

import { TButton, TCard, TIcon, TTag, Wallet } from 'ui_73info'

const props = defineProps<{
  /** 保证金读数；null = 还没开通预付账户（从没充过钱） */
  deposit: DepositReading | null
  /** 信用额度；null = 读不到或没启用封顶，那一枚标签就不画 */
  credit: DevCreditSelf | null
  loading: boolean
  error: string
}>()

const emit = defineEmits<{
  (event: 'recharge'): void
  (event: 'withdraw'): void
}>()

const money = (fen: number | null | undefined) => `¥${toYuan(fen).toFixed(2)}`

/** 能不能提：后端算好的可提额度 > 0。 */
const canWithdraw = computed(() => (props.deposit?.withdrawableFen ?? 0) > 0)

/** 信用额度标签只在启用保证金封顶时才有意义；credit_score 是浮点分，不是金额，不能过 toYuan。 */
const creditText = computed(() => {
  const credit = props.credit
  if (!credit || !credit.enforce_deposit_limit) {
    return ''
  }
  return `信用 ${credit.credit_score.toFixed(2)} · 剩余可充 ${money(credit.remaining_deposit_cap_fen)}`
})

/** 还没开通预付账户（从没充过钱）。 */
const notOpened = computed(() => !props.loading && !props.error && !props.deposit)
</script>

<template>
  <TCard class="dev-surface-card wallet-hero__card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">保证金余额</h3>
      </div>
      <div class="dev-card-head__actions">
        <TTag variant="outline" tone="info">
          充值总额 {{ money(props.deposit?.totalRechargedFen) }}
        </TTag>
      </div>
    </div>
    <div class="wallet-hero__body">
      <div class="wallet-hero__main">
        <span class="dev-figure" :class="{ 'dev-figure--muted': !canWithdraw }">
          {{ money(props.deposit?.withdrawableFen) }}
        </span>
      </div>
      <div class="wallet-hero__tags">
        <TTag v-if="(props.deposit?.frozenFen ?? 0) > 0" variant="outline" tone="warning">
          冻结中 {{ money(props.deposit?.frozenFen) }}
        </TTag>
        <TTag
          v-if="(props.deposit?.pendingWithdrawalFen ?? 0) > 0"
          variant="outline"
          tone="warning"
        >
          处理中 {{ money(props.deposit?.pendingWithdrawalFen) }}
        </TTag>
        <TTag variant="outline" :tone="canWithdraw ? 'success' : 'info'">
          {{ canWithdraw ? '满足提现条件' : '不满足提现条件' }}
        </TTag>
        <TTag v-if="creditText" variant="outline" tone="accent">{{ creditText }}</TTag>
      </div>
      <p v-if="props.error" class="wallet-hero__note" role="alert">{{ props.error }}</p>
      <p v-else-if="notOpened" class="wallet-hero__note">
        还没有充值过接单保证金。担保单接单前需要先充值，接单时会按需求预算冻结。
      </p>
    </div>
    <div class="wallet-hero__footer">
      <TButton
        variant="solid"
        tone="accent"
        :disabled="!canWithdraw"
        :loading="props.loading"
        @click="emit('withdraw')"
      >
        <TIcon v-if="!props.loading">
          <Wallet />
        </TIcon>
        <span>提现保证金</span>
      </TButton>
      <TButton variant="outline" @click="emit('recharge')">
        <TIcon>
          <Wallet />
        </TIcon>
        <span>充值</span>
      </TButton>
    </div>
  </TCard>
</template>
