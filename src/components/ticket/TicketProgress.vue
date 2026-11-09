<script setup lang="ts">
import { computed } from 'vue'

import type { TicketEvent, TicketItem } from '@/api/tickets'
import {
  buildTicketTimeline,
  formatTicketTime,
  ticketPriorityLabel,
  ticketStatusLabel,
} from '@/shared/ticketDisplay'

const props = defineProps<{
  ticket: TicketItem
  events: TicketEvent[]
}>()

const timeline = computed(() => buildTicketTimeline(props.ticket, props.events))
const firstResponseText = computed(() => {
  if (props.ticket.first_response_at) return formatTicketTime(props.ticket.first_response_at)
  if (props.ticket.first_response_due_at) {
    return `截止 ${formatTicketTime(props.ticket.first_response_due_at)}`
  }
  return '待响应'
})
const lastReplyText = computed(() => {
  const value = props.ticket.last_staff_reply_at ?? props.ticket.last_user_reply_at
  return formatTicketTime(value)
})
</script>

<template>
  <section class="ticket-progress" aria-label="工单进度">
    <div class="ticket-progress__meta">
      <span :class="`ticket-status ticket-status--${ticket.status}`">{{
        ticketStatusLabel(ticket.status)
      }}</span>
      <span class="ticket-progress__tag">{{ ticketPriorityLabel(ticket.priority) }}</span>
      <span class="ticket-progress__tag"> 负责人：{{ ticket.assigned_to || '未分配' }} </span>
      <span v-if="ticket.first_response_overdue" class="ticket-progress__overdue"
        >首次响应逾期</span
      >
      <span v-if="(ticket.reopen_count ?? 0) > 0" class="ticket-progress__tag">
        重开 {{ ticket.reopen_count }} 次
      </span>
    </div>
    <dl class="ticket-progress__facts">
      <div>
        <dt>首次响应</dt>
        <dd>{{ firstResponseText }}</dd>
      </div>
      <div>
        <dt>最后回复</dt>
        <dd>{{ lastReplyText }}</dd>
      </div>
    </dl>
    <ol v-if="timeline.length" class="ticket-progress__timeline">
      <li v-for="entry in timeline" :key="entry.key">
        <span class="ticket-progress__dot" aria-hidden="true" />
        <div class="ticket-progress__entry">
          <strong>{{ entry.label }}</strong>
          <time>{{ formatTicketTime(entry.at) }}</time>
          <p v-if="entry.detail">{{ entry.detail }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.ticket-progress {
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--73-border);
  border-radius: 10px;
  background: var(--73-surface-strong);
}
.ticket-progress__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ticket-progress__tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--73-neutral-soft);
  color: var(--73-neutral-text);
  font-size: 12px;
}
.ticket-progress__overdue {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--73-danger-soft);
  color: var(--73-danger-text);
  font-size: 12px;
}
.ticket-progress__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 0;
}
.ticket-progress__facts div {
  display: grid;
  gap: 2px;
}
.ticket-progress__facts dt {
  color: var(--73-ink-muted);
  font-size: 12px;
}
.ticket-progress__facts dd {
  margin: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.ticket-progress__timeline {
  display: grid;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.ticket-progress__timeline li {
  position: relative;
  display: flex;
  gap: 10px;
  padding-left: 4px;
}
.ticket-progress__dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--73-accent);
}
.ticket-progress__entry {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.ticket-progress__entry time {
  color: var(--73-ink-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.ticket-progress__entry p {
  margin: 0;
  font-size: 12px;
  color: var(--73-ink-soft);
}
.ticket-status {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--73-neutral-soft);
  color: var(--73-neutral-text);
  font-size: 12px;
}
.ticket-status--open {
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}
.ticket-status--resolved {
  background: var(--73-success-soft);
  color: var(--73-success-text);
}
</style>
