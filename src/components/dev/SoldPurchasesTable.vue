<script setup lang="ts">
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import {
  canSellerRefundPurchase,
  fenToYuanText,
  formatPurchaseAmountLabel,
  isPointsPurchaseOrder,
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
