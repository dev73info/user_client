<script setup lang="ts">
/**
 * 「保证金余额」卡：可提现保证金大数、冻结/退款/提现处理中的标签、信用额度，
 * 以及两个出口（提现保证金 / 充值）。
 *
 * 保证金是接单资格的押金，与「接单收入」是两个互不相通的池子：这里只画
 * `useDevWalletDeposit` 的投影，充值、提现两个动作都只 `emit` 出去，弹窗与回刷在页面。
 *
 * 版面与「接单收入」卡（`DevWalletIncomeCard`）逐段对齐，两张并排时骨架一致：
 * 卡头（标题 + 右侧汇总标签）→ 大数 → 标签行 → 分隔线 → 操作区。
 *
 * 两个坑，改样式时别再走回去：
 * - 不要用 `.deposit-card` 当根类名：`styles/modal/10-deposit-card-modal-actions.css`
 *   里**定金支付弹窗**占着这个名字，写着 `width: min(540px, 100%)`，会把卡片限死成半宽；
 * - 不要用 `--el-*` 令牌：这套 Element 变量在本应用没有定义，描边会塌成 0、背景变透明，
 *   卡片退化成裸区块。本组件只用 `--dev-*` / `--73-*`。
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

const fenToYuan = (fen: number | null | undefined) => `¥${toYuan(fen).toFixed(2)}`

/** 能不能提：后端算好的可提额度 > 0。 */
const canWithdraw = computed(() => (props.deposit?.withdrawableFen ?? 0) > 0)

/** 信用额度标签只在启用保证金封顶时才有意义。 */
const creditText = computed(() => {
  const credit = props.credit
  if (!credit || !credit.enforce_deposit_limit) {
    return ''
  }
  // credit_score 是浮点分，不是金额，不能过 toYuan
  return `信用 ${credit.credit_score.toFixed(2)} · 剩余可充 ${fenToYuan(credit.remaining_deposit_cap_fen)}`
})
</script>

<template>
  <TCard class="dev-surface-card wallet-hero__card deposit-balance-card">
    <div class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">保证金余额</h3>
      </div>
      <div class="dev-card-head__actions">
        <TTag variant="outline" tone="info">
          充值总额 {{ fenToYuan(props.deposit?.totalRechargedFen) }}
        </TTag>
      </div>
    </div>

    <div class="wallet-hero__body">
      <div class="wallet-hero__main">
        <span class="dev-figure" :class="{ 'dev-figure--muted': !canWithdraw }">
          {{ fenToYuan(props.deposit?.withdrawableFen) }}
        </span>
      </div>

      <div class="wallet-hero__tags">
        <TTag v-if="(props.deposit?.frozenFen ?? 0) > 0" variant="outline" tone="warning">
          冻结中 {{ fenToYuan(props.deposit?.frozenFen) }}
        </TTag>
        <TTag
          v-if="(props.deposit?.pendingWithdrawalFen ?? 0) > 0"
          variant="outline"
          tone="warning"
        >
          处理中 {{ fenToYuan(props.deposit?.pendingWithdrawalFen) }}
        </TTag>
        <TTag variant="outline" :tone="canWithdraw ? 'success' : 'info'">
          {{ canWithdraw ? '满足提现条件' : '不满足提现条件' }}
        </TTag>
        <TTag v-if="creditText" variant="outline" tone="accent">{{ creditText }}</TTag>
      </div>

      <p v-if="props.error" class="wallet-hero__empty" role="alert">{{ props.error }}</p>
      <p v-else-if="!props.loading && !props.deposit" class="wallet-hero__empty">
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

<style scoped>
/* 底 / 描边 / 圆角 / 阴影 / 内边距由 .dev-surface-card 给，标题行由 .dev-card-head 给，
   大数与标签行由 .wallet-hero* 给。这里只留本卡特有的一条。 */

/* 未开通 / 出错时的说明：贴在标签行下方，两行内读完。 */
.wallet-hero__empty {
  margin: 12px 0 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.7;
}

.wallet-hero__empty[role='alert'] {
  color: var(--73-danger);
}
</style>
