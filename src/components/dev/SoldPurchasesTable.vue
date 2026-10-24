<script setup lang="ts">
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import {
  canSellerRefundPurchase,
  fenToYuanText,
  formatPurchaseAmountLabel,
  isPointsPurchaseOrder,
  promoRejectReasonLabel,
  promoterSplitStatusLabel,
  promoShareBpsLabel,
  refundInitiatorLabel,
  resourcePurchaseStatusLabel,
} from '@/shared/resourceSale'

import { TButton, TTable, TTableColumn, TTag } from 'ui_73info'

/**
 * 「售出订单」表格：资源、买家、金额、状态、可退余额、推广、支付时间、操作。
 *
 * 只画与派发：金额与状态口径走 `@/shared/resourceSale` 的纯函数；
 * 点资源标题 emit `open`，点「主动退款」emit `refund`，请求与弹窗都在页面那一层。
 */
defineProps<{
  rows: ResourcePurchaseOrder[]
  loading: boolean
  emptyText: string
}>()

const emit = defineEmits<{
  open: [order: ResourcePurchaseOrder]
  refund: [order: ResourcePurchaseOrder]
}>()

/** 退款留痕里发起方为「卖家」或「平台」；只有已退过款的订单才有。 */
function refundTraceText(order: ResourcePurchaseOrder): string {
  if (order.refunded_amount_fen <= 0 && !order.last_refund_at) {
    return ''
  }
  const parts: string[] = []
  if (order.last_refund_at) {
    parts.push(`${order.last_refund_at} 由${refundInitiatorLabel(order.refund_initiator)}发起`)
  }
  if (order.refund_operator) {
    parts.push(`操作人 ${order.refund_operator}`)
  }
  if (order.refund_reason) {
    parts.push(`原因：${order.refund_reason}`)
  }
  return parts.join(' · ')
}

/**
 * R029：这一单有没有推广痕迹。
 *
 * 「有推广」不只是成功归因（`promoter` 非空）——带过码但没归因成功（未实名 / 无结算账户 /
 * 就是买卖双方本人）的订单也要露出来，卖家才能看到「这单本来能带来推广」以及原因。
 */
function hasPromoTrace(order: ResourcePurchaseOrder): boolean {
  return Boolean(
    order.promoter ||
    order.promo_code ||
    order.promo_reject_reason ||
    Number(order.promoter_fee_fen ?? 0) > 0,
  )
}

/** 推广列的 hover 说明：分账状态 + 未归因原因（都没内容时返回空串，不产生空 title 气泡）。 */
function promoTraceTitle(order: ResourcePurchaseOrder): string {
  const parts: string[] = []
  if (order.promoter_split_status) {
    parts.push(`推广分账：${promoterSplitStatusLabel(order.promoter_split_status)}`)
  }
  if (order.promo_code) {
    parts.push(`推广码：${order.promo_code}`)
  }
  if (order.promo_reject_reason) {
    parts.push(`未归因原因：${promoRejectReasonLabel(order.promo_reject_reason)}`)
  }
  return parts.join(' · ')
}
</script>

<template>
  <TTable
    :loading="loading"
    :data="rows"
    stripe
    class="dev-table sold-purchases__table"
    aria-label="售出订单列表"
  >
    <template #empty>
      <p class="dev-empty-state">{{ emptyText }}</p>
    </template>
    <TTableColumn label="资源" min-width="200">
      <template #default="scope">
        <div class="sold-purchases__title-cell">
          <button type="button" class="sold-purchases__title-link" @click="emit('open', scope.row)">
            {{ scope.row.resource_title || `资源 #${scope.row.resource_id}` }}
          </button>
          <div class="sold-purchases__meta">订单号 {{ scope.row.order_no }}</div>
        </div>
      </template>
    </TTableColumn>
    <TTableColumn label="买家" min-width="140">
      <template #default="scope">
        <span class="sold-purchases__buyer">{{ scope.row.buyer }}</span>
      </template>
    </TTableColumn>
    <TTableColumn label="金额" min-width="128">
      <template #default="scope">
        <div class="sold-purchases__amount-cell">
          <span class="sold-purchases__amount">{{ formatPurchaseAmountLabel(scope.row) }}</span>
          <span v-if="scope.row.refunded_amount_fen > 0" class="sold-purchases__refunded-chip">
            已退 ¥{{ fenToYuanText(scope.row.refunded_amount_fen) }}
          </span>
        </div>
      </template>
    </TTableColumn>
    <TTableColumn label="状态" min-width="120">
      <template #default="scope">
        <TTag variant="outline" :tone="scope.row.status === 'refunded' ? 'warning' : 'accent'">
          {{ resourcePurchaseStatusLabel(scope.row.status) }}
        </TTag>
      </template>
    </TTableColumn>
    <TTableColumn label="可退余额" min-width="120">
      <template #default="scope">
        <span v-if="isPointsPurchaseOrder(scope.row)" class="sold-purchases__meta"
          >积分单不支持退款</span
        >
        <span v-else class="sold-purchases__amount">
          ¥{{ fenToYuanText(scope.row.refundable_amount_fen) }}
        </span>
      </template>
    </TTableColumn>
    <!-- R029 推广：卖家是自己掏这笔钱的人，这里刻意给他看推广者用户名（便于对账）。
         没推广痕迹的订单只留一个「—」，不新增空块。 -->
    <TTableColumn label="推广" min-width="168">
      <template #default="scope">
        <div
          v-if="hasPromoTrace(scope.row)"
          class="sold-purchases__promo"
          :title="promoTraceTitle(scope.row)"
        >
          <span class="sold-purchases__promo-name">
            {{ scope.row.promoter || '未归因' }}
          </span>
          <span class="sold-purchases__meta">
            {{ promoShareBpsLabel(scope.row.promo_share_bps) }}
            <template v-if="scope.row.promoter_fee_fen > 0">
              · 分成 ¥{{ fenToYuanText(scope.row.promoter_fee_fen) }}
            </template>
            <template v-if="scope.row.promo_reject_reason">
              · {{ promoRejectReasonLabel(scope.row.promo_reject_reason) }}
            </template>
          </span>
        </div>
        <span v-else class="sold-purchases__meta">—</span>
      </template>
    </TTableColumn>
    <TTableColumn label="支付时间" min-width="160">
      <template #default="scope">
        <span>{{ scope.row.paid_at || '—' }}</span>
        <div v-if="refundTraceText(scope.row)" class="sold-purchases__meta">
          {{ refundTraceText(scope.row) }}
        </div>
      </template>
    </TTableColumn>
    <TTableColumn label="操作" min-width="130" fixed="right">
      <template #default="scope">
        <TButton
          v-if="canSellerRefundPurchase(scope.row)"
          variant="outline"
          tone="accent"
          @click="emit('refund', scope.row)"
        >
          主动退款
        </TButton>
        <span v-else class="sold-purchases__meta">
          {{ isPointsPurchaseOrder(scope.row) ? '不支持退款' : '不可退款' }}
        </span>
      </template>
    </TTableColumn>
  </TTable>
</template>

<style scoped src="./sold-purchases-table.css"></style>
<style scoped src="./../payment/sold-purchases-shared.css"></style>
