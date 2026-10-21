<script setup lang="ts">
import { TButton } from 'ui_73info'
import type { ConversationHistoryDisclosure } from '@/shared/conversations'

/**
 * 门户侧的「待我确认的历史沟通公开申请」面板（`.messages-disclosure-panel`）。
 *
 * 与开发者侧那条 `.dev-notice` 是同一件事、两套皮：门户侧排成卡片 + 两颗描边按钮。
 * 没有待确认申请时整块不渲染（会话列表自己占满）。
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
  <section
    v-if="items.length"
    class="messages-disclosure-panel"
    aria-label="待我确认的历史沟通公开申请"
  >
    <article v-for="item in items" :key="`history-vote-${item.id}`" class="messages-disclosure">
      <div class="messages-disclosure__main">
        <strong>{{ item.requirement_title || item.requirement_id }}</strong>
        <small>{{ item.requirement_id }} · 前任开发者 {{ item.previous_developer }}</small>
        <p>
          现任开发者 {{ item.current_developer }} 申请查看前任开发者
          {{
            item.previous_developer
          }}
          负责期间的沟通记录。你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
        </p>
      </div>
      <div class="messages-disclosure__actions">
        <TButton
          variant="outline"
          :disabled="votingId !== null"
          @click="emit('vote', item, 'approved')"
        >
          同意公开
        </TButton>
        <TButton
          variant="outline"
          :disabled="votingId !== null"
          @click="emit('vote', item, 'rejected')"
        >
          拒绝
        </TButton>
      </div>
    </article>
  </section>
</template>
