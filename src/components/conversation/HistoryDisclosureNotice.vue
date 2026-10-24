<script setup lang="ts">
import { computed } from 'vue'

import { historySegmentStateLabel } from '@/composables/useHistoryDisclosure'
import type { ConversationHistorySegment } from '@/shared/conversations'

/**
 * 接手前历史沟通「未公开」提示条（从 `RequirementConversationModal.vue` 抽出）。
 *
 * 贴在消息列表顶部，说明接手前那段为何看不到：只有现任开发者视角下才有区段
 * （客户不受隐藏限制、后端返回空数组）。只 emit `request`，申请接口在 `useHistoryDisclosure` 里。
 */
const props = defineProps<{
  segments: ConversationHistorySegment[]
  canRequest: boolean
  requesting: boolean
}>()

const emit = defineEmits<{
  request: []
}>()

const hiddenDevelopers = computed(() =>
  [...new Set(props.segments.map((segment) => segment.previous_developer))].join('、'),
)
</script>

<template>
  <div v-if="segments.length" class="conversation-history-notice">
    <strong>此前的沟通记录未公开</strong>
    <p>
      接手前由
      {{ hiddenDevelopers }} 负责的那段沟通默认不展示，需要前任开发者与客户都确认后才会公开。
    </p>
    <ul class="conversation-history-notice__segments">
      <li
        v-for="segment in segments"
        :key="`${segment.previous_developer}-${segment.segment_start}`"
      >
        <span>前任开发者 {{ segment.previous_developer }}</span>
        <small>{{ segment.segment_start }} ~ {{ segment.segment_end }}</small>
        <em>{{ historySegmentStateLabel(segment.status) }}</em>
      </li>
    </ul>
    <button
      v-if="canRequest"
      class="conversation-history-notice__action"
      type="button"
      :disabled="requesting"
      @click="emit('request')"
    >
      {{ requesting ? '提交中...' : '申请查看历史沟通' }}
    </button>
    <p v-else class="conversation-history-notice__tip">
      已提交申请，等待前任开发者与客户确认；如有申请被拒绝，那段沟通不会公开。
    </p>
  </div>
</template>

<style scoped>
/* 历史沟通未公开提示：贴在消息列表顶部，说明接手前那段为何看不到 */
.conversation-history-notice {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  width: 100%;
  max-width: 880px;
  margin: 0 auto 14px;
  padding: 12px 14px;
  border: 1px dashed color-mix(in srgb, var(--73-warning) 42%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--73-warning-soft) 94%, transparent);
}

.conversation-history-notice strong {
  color: var(--73-warning-text);
  font-size: 13px;
}

.conversation-history-notice p {
  margin: 0;
  color: var(--73-ink-soft);
  font-size: 12.5px;
  line-height: 1.6;
}

.conversation-history-notice__segments {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.conversation-history-notice__segments li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  color: var(--73-ink-soft);
  font-size: 12px;
}

.conversation-history-notice__segments small {
  color: var(--73-ink-placeholder);
  font-size: 11.5px;
}

.conversation-history-notice__segments em {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--73-warning) 16%, transparent);
  color: var(--73-warning-text);
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.conversation-history-notice__action {
  justify-self: start;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: var(--73-accent);
  color: var(--73-surface-strong);
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.conversation-history-notice__action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.conversation-history-notice__tip {
  color: var(--73-ink-muted);
}

@media (max-width: 640px) {
  .conversation-history-notice {
    width: 100%;
    margin-bottom: 10px;
    padding: 10px 12px;
  }

  /* 移动端触摸目标 ≥44px（原本与表决按钮同一条规则；表决面板搬走后那一半落在
     ConversationHistoryVote.vue 的同档位媒体查询里，两边最小高度都仍是 44px） */
  .conversation-history-notice__action {
    min-height: 44px;
  }

  .conversation-history-notice__segments em {
    margin-left: 0;
  }
}
</style>
