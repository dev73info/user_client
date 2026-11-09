<script setup lang="ts">
/**
 * 工单详情里的满意度区块：已有评价显示星级与文字，没有评价且可评时给「评价工单」。
 *
 * 从 `views/TicketCenterView.vue` 拆出来（视图 300 行预算）：只做展示与「去评价」一个事件，
 * 弹窗与提交仍留在页面（`TicketSatisfactionDialog` + `useTicketActions`）。
 */
import type { TicketItem } from '@/api/tickets'
import { TButton } from 'ui_73info'

import { hasTicketSatisfaction, ticketSatisfactionStars } from '@/shared/ticketDisplay'

defineProps<{
  ticket: TicketItem
  canRate: boolean
}>()

const emit = defineEmits<{
  (e: 'rate'): void
}>()
</script>

<template>
  <section v-if="hasTicketSatisfaction(ticket)" class="ticket-satisfaction-view">
    <div class="ticket-satisfaction-view__head">
      <strong>满意度</strong>
      <span class="ticket-satisfaction-view__stars">
        {{ ticketSatisfactionStars(ticket.satisfaction_rating) }}
      </span>
      <TButton v-if="canRate" variant="text" tone="accent" size="sm" @click="emit('rate')">
        修改评价
      </TButton>
    </div>
    <p v-if="ticket.satisfaction_comment" class="ticket-item__meta">
      {{ ticket.satisfaction_comment }}
    </p>
  </section>
  <section v-else-if="canRate" class="ticket-satisfaction-view">
    <div class="ticket-satisfaction-view__head">
      <strong>满意度</strong>
      <TButton variant="outline" size="sm" @click="emit('rate')">评价工单</TButton>
    </div>
  </section>
</template>

<style scoped>
.ticket-satisfaction-view {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  padding: 12px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-surface-strong);
}
.ticket-satisfaction-view__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.ticket-satisfaction-view__stars {
  color: var(--73-warning);
  letter-spacing: 2px;
}
.ticket-item__meta {
  color: var(--73-ink-muted);
  font-size: 12px;
}
</style>
