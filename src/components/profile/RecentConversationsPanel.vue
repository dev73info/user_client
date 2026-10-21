<script setup lang="ts">
import type { RequirementConversationCard } from '@/composables/useRequirementConversations'

/**
 * 总览里的「最近沟通」面板：最多三张会话卡，点一张打开该需求的会话弹窗。
 *
 * 零耦合：卡片文案由会话域算好（`useRequirementConversations` 的 `recentConversationCards`），
 * 弹窗与接口都在视图那边；这里点一下只回传需求号，不自己发路由。
 *
 * 移动端整块不出现（`.overview-panel--messages` 在视图的 `@760` 里收起——布局取舍属于页面，
 * 所以那条规则留在视图）。
 */
defineProps<{
  /** 已排好序、切好条数的卡（见 `useRequirementConversations`）。 */
  cards: RequirementConversationCard[]
}>()

const emit = defineEmits<{ open: [card: RequirementConversationCard] }>()
</script>

<template>
  <section class="overview-panel overview-panel--messages">
    <div class="overview-section-head">
      <div>
        <h2>最近沟通</h2>
      </div>
      <div class="overview-inline-actions">
        <RouterLink class="overview-link" :to="{ name: 'workbench-messages' }">消息中心</RouterLink>
      </div>
    </div>
    <div v-if="cards.length === 0" class="overview-empty-state">
      <strong>暂无可用会话</strong>
    </div>
    <div v-else class="conversation-card-list">
      <button
        v-for="card in cards"
        :key="card.requirementId"
        type="button"
        class="conversation-card"
        @click="emit('open', card)"
      >
        <span class="conversation-card__title">{{ card.title }}</span>
        <span class="conversation-card__id">{{ card.requirementId }}</span>
        <span class="conversation-card__meta">{{ card.meta }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.conversation-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.conversation-card {
  display: grid;
  gap: 6px;
  min-height: 112px;
  padding: 14px 16px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 16px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
}

.conversation-card:hover {
  border-color: rgba(75, 120, 225, 0.5);
  box-shadow: 0 14px 28px rgba(76, 103, 172, 0.12);
}

.conversation-card__title {
  color: #0f172a;
  font-weight: 800;
  line-height: 1.4;
}

.conversation-card__id,
.conversation-card__meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}
</style>
