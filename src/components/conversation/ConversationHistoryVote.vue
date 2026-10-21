<script setup lang="ts">
import type { ConversationHistoryDisclosureBrief } from '@/shared/conversations'

/**
 * 待我确认的历史沟通公开申请（会话通道上方一条确认条）。
 *
 * 从 `RequirementConversationModal.vue` 抽出：文案照抄，只把两个按钮换成 emit——
 * 真正调接口、置表决中状态的是 `useHistoryDisclosure`，这里连 token 都不碰。
 * 一条申请渲染一条，列表循环留在父组件的会话模板里。
 */
defineProps<{
  item: ConversationHistoryDisclosureBrief
  /** 有表决在飞：两颗按钮一起禁用，避免连点重复提交。 */
  voting: boolean
}>()

const emit = defineEmits<{
  vote: [decision: 'approved' | 'rejected']
}>()
</script>

<template>
  <div class="conversation-history-vote">
    <p>
      现任开发者 {{ item.current_developer }} 申请查看前任开发者
      {{ item.previous_developer }} 负责期间的沟通记录。
      你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
    </p>
    <div class="conversation-history-vote__actions">
      <button type="button" :disabled="voting" @click="emit('vote', 'approved')">同意公开</button>
      <button type="button" :disabled="voting" @click="emit('vote', 'rejected')">拒绝</button>
    </div>
  </div>
</template>

<style scoped>
/* 待我确认的公开申请：会话通道上方一条确认条 */
.conversation-history-vote {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(216, 228, 244, 0.95);
  background: #fffaf0;
}

.conversation-history-vote p {
  margin: 0;
  color: #78594a;
  font-size: 12.5px;
  line-height: 1.6;
}

.conversation-history-vote__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.conversation-history-vote__actions button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.conversation-history-vote__actions button:first-child {
  border-color: #2d76ec;
  background: #2d76ec;
  color: #ffffff;
}

.conversation-history-vote__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 640px) {
  /* 移动端触摸目标 ≥44px（提示条那颗按钮的同一档位规则在 HistoryDisclosureNotice.vue） */
  .conversation-history-vote__actions button {
    min-height: 44px;
  }
}
</style>
