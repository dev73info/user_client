<script setup lang="ts">
import { TIcon, WarningFilled } from 'ui_73info'
import type { ConversationHistoryDisclosure } from '@/shared/conversations'

/**
 * 开发者工作台的「历史沟通公开申请」提示条（统一层 `.dev-notice`）。
 *
 * 前任开发者已经读不到这条会话（不再是参与方），所以消息中心给他表决入口：
 * 只要两票里还差他这一票就列在这里，同意与拒绝各一颗。
 */
defineProps<{
  items: ConversationHistoryDisclosure[]
  /** 正在提交的那条：提交期间两颗按钮一起禁用，避免连点投出两票 */
  votingId: number | null
}>()

const emit = defineEmits<{
  vote: [item: ConversationHistoryDisclosure, decision: 'approved' | 'rejected']
}>()
</script>

<template>
  <div v-for="item in items" :key="`history-vote-${item.id}`" class="dev-notice">
    <span class="dev-notice__icon">
      <TIcon>
        <WarningFilled />
      </TIcon>
    </span>
    <div class="dev-notice__copy">
      <strong>{{ item.requirement_title || item.requirement_id }}</strong>
      <p>
        {{ item.requirement_id }} · 前任开发者 {{ item.previous_developer }}；现任开发者
        {{ item.current_developer }} 申请查看前任开发者
        {{
          item.previous_developer
        }}
        负责期间的沟通记录。你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
      </p>
    </div>
    <div class="dev-notice__action">
      <button
        class="dev-btn dev-btn--ghost"
        type="button"
        :disabled="votingId !== null"
        @click="emit('vote', item, 'rejected')"
      >
        拒绝
      </button>
      <button
        class="dev-btn dev-btn--primary"
        type="button"
        :disabled="votingId !== null"
        @click="emit('vote', item, 'approved')"
      >
        同意公开
      </button>
    </div>
  </div>
</template>
