<script setup lang="ts">
import type { SupportConversation } from '@/api/support'

defineProps<{ conversations: SupportConversation[] }>()

defineEmits<{
  open: [id: number]
}>()

function stars(rating: number | null | undefined) {
  return rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : ''
}
</script>

<template>
  <div class="support-history">
    <p v-if="!conversations.length" class="support-hint">还没有历史会话</p>
    <button
      v-for="item in conversations"
      :key="item.id"
      type="button"
      class="support-history__item"
      @click="$emit('open', item.id)"
    >
      <span class="support-history__top">
        <span class="support-history__text">{{ item.last_message || '（无消息）' }}</span>
        <span class="support-history__meta">
          {{ item.status === 'open' ? '进行中' : '已结束' }}
        </span>
      </span>
      <span class="support-history__sub">
        <span>{{ item.conversation_no }}</span>
        <span v-if="item.agent_username">客服 {{ item.agent_username }}</span>
        <span v-if="item.satisfaction_rating" class="support-history__stars">
          {{ stars(item.satisfaction_rating) }}
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.support-history {
  flex: 1;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--73-surface-strong);
}

.support-history__item {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--73-border);
  background: transparent;
  color: var(--73-ink);
  text-align: left;
  cursor: pointer;
}

.support-history__top,
.support-history__sub {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.support-history__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.support-history__meta,
.support-history__sub {
  flex-shrink: 0;
  color: var(--73-ink-muted);
  font-size: 11px;
}

.support-history__sub {
  justify-content: flex-start;
}

.support-history__stars {
  margin-left: auto;
  color: var(--73-warning);
  letter-spacing: 1px;
}
</style>
