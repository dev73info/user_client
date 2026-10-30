<script setup lang="ts">
import { receiptMoney, type DevReceipt } from '@/shared/devDelivery'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { TButton, TDialog, TTag } from 'ui_73info'

/**
 * 「回款详情」弹窗：卡上只放到账合计与笔数，逐笔摊开在这里。
 *
 * 只渲染、只 emit：抬头、委托方、状态徽标与逐笔回执都由页面算好传进来。
 * 「待签合同」那一档要读页面一次取回的 `signingStatusMap`，在这里再判一次就是第二份口径。
 * 金额、时间、流水号来自同一份钱包回执（与「收益钱包 → 收入记录」同一个接口），这里不另算。
 */
defineProps<{
  open: boolean
  /** 打开的这一行；数据还没回来或这一行已被筛掉时是 `null`，弹窗留空壳。 */
  detail: {
    /** 弹窗标题：带上需求编号，一眼看出是哪一单。 */
    dialogTitle: string
    /** 行抬头：需求单行取需求标题，补充行取钱包回执里的标题。 */
    title: string
    requirementId: string
    /** 委托方，没有时页面已经填成 `—`。 */
    customer: string
    statusLabel: string
    statusTone: 'info' | 'success' | 'warning' | 'danger'
    /** 逐笔到账，已按到账时间正序（托管下定金先分账、尾款后分账）。 */
    receipts: DevReceipt[]
    /** 累计到账：两位小数带 ¥，与收益钱包同一口径。 */
    totalText: string
  } | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <TDialog
    :open="open"
    :title="detail?.dialogTitle ?? '回款详情'"
    width="560px"
    class="dev-dialog"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="detail" class="dev-receipt-detail">
      <div class="dev-receipt-detail__head">
        <div class="dev-receipt-detail__title">{{ detail.title }}</div>
        <div class="dev-receipt-detail__meta">
          <span>{{ detail.requirementId }}</span>
          <span>委托方 {{ detail.customer }}</span>
          <TTag variant="outline" :tone="detail.statusTone">{{ detail.statusLabel }}</TTag>
        </div>
      </div>

      <div class="dev-receipt-detail__total">
        <span class="dev-receipt-detail__total-label">
          累计到账 · 共 {{ detail.receipts.length }} 笔
        </span>
        <span class="dev-figure dev-figure--sm">{{ detail.totalText }}</span>
      </div>

      <ul class="dev-receipt-detail__list">
        <li
          v-for="(receipt, index) in detail.receipts"
          :key="receipt.paymentId"
          class="dev-receipt-detail__item"
        >
          <div class="dev-receipt-detail__item-head">
            <span class="dev-receipt-detail__item-index">第 {{ index + 1 }} 笔</span>
            <span class="dev-receipt-detail__item-amount">{{ receiptMoney(receipt.amount) }}</span>
          </div>
          <div class="dev-receipt-detail__facts">
            <div class="dev-receipt-detail__fact">
              <span class="dev-receipt-detail__fact-label">到账时间</span>
              <span class="dev-receipt-detail__fact-value">{{
                formatCnDateTime(receipt.paidAt)
              }}</span>
            </div>
            <div class="dev-receipt-detail__fact">
              <span class="dev-receipt-detail__fact-label">支付流水号</span>
              <span class="dev-receipt-detail__fact-value">{{ receipt.paymentId }}</span>
            </div>
          </div>
        </li>
      </ul>

      <p class="dev-receipt-detail__note">
        托管模式下定金与尾款各分账一次，同一需求会有两笔到账，金额按分账净额逐笔列出。
      </p>
    </div>

    <template #footer>
      <TButton variant="outline" @click="emit('update:open', false)">关闭</TButton>
    </template>
  </TDialog>
</template>

<style scoped>
/* === 回款详情弹窗（从「交付记录」页搬来） ===
   弹窗由 TDialog teleport 到 body，配色令牌靠 .dev-dialog（见 dev-base.css），
   排版是这一块特有的。整块分三层：需求抬头 → 累计到账读数 → 逐笔清单。 */
.dev-receipt-detail {
  display: grid;
  gap: 18px;
}

.dev-receipt-detail__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  color: var(--dev-ink);
  overflow-wrap: anywhere;
}

.dev-receipt-detail__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--dev-muted);
}

/* 累计到账：读数取统一层的 .dev-figure--sm（金色大数），
   这里只把它和左侧说明排成一行、压一条分隔线与下面的清单分开。 */
.dev-receipt-detail__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 16px;
  border-bottom: 1px solid var(--dev-line);
}

.dev-receipt-detail__total-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--dev-ink-soft);
}

.dev-receipt-detail__list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一笔到账一块：白底细描边的内嵌容器，圆角取 --dev-radius-inner（卡片内嵌块那一档） */
.dev-receipt-detail__item {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border: 1px solid var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
}

.dev-receipt-detail__item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.dev-receipt-detail__item-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--dev-muted);
}

/* 单笔金额同样用金色（与累计读数、钱包里的入账金额同一支） */
.dev-receipt-detail__item-amount {
  font-size: 18px;
  font-weight: 600;
  color: var(--dev-gold);
  font-variant-numeric: tabular-nums;
}

/* 流水号是长串，窄屏必须能断行，否则会把弹窗顶宽 */
.dev-receipt-detail__facts {
  display: grid;
  gap: 6px;
}

.dev-receipt-detail__fact {
  display: flex;
  align-items: baseline;
  gap: 12px;
  font-size: 13px;
}

.dev-receipt-detail__fact-label {
  flex: 0 0 76px;
  color: var(--dev-muted);
}

.dev-receipt-detail__fact-value {
  min-width: 0;
  color: var(--dev-ink-soft);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.dev-receipt-detail__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dev-muted);
}
</style>
