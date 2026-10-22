<script setup lang="ts">
import { ChatDotRound, TIcon } from 'ui_73info'

import type { ConversationTimelineItem } from '@/composables/useConversationTimeline'
import type { ConversationCardMeta } from '@/shared/conversationCards'
import type {
  ConversationHistorySegment,
  RequirementConversationMessage,
} from '@/shared/conversations'
import ConversationCardItem from '@/components/conversation/ConversationCardItem.vue'
import ConversationMessageItem from '@/components/conversation/ConversationMessageItem.vue'
import HistoryDisclosureNotice from '@/components/conversation/HistoryDisclosureNotice.vue'

/**
 * 会话时间线：未公开历史的提示条、加载 / 失败 / 空态，以及日期条、卡片、消息气泡的排布。
 *
 * 从 `RequirementConversationModal.vue` 的消息区里整块搬出来。滚动容器仍留在父组件
 * （`scrollToBottom` 要直接改它的 `scrollTop`），这里只是容器里的内容；每条消息、每张卡片的
 * 样式与节点一起搬进各自组件，断点规则跟着一起走，父组件里不留死规则。
 */
defineProps<{
  items: ConversationTimelineItem[]
  loading: boolean
  errorMessage: string
  /** 消息条数：为 0 且不在加载 / 失败态时渲染空态。 */
  messageCount: number
  hiddenSegments: ConversationHistorySegment[]
  canRequestHistory: boolean
  historyRequesting: boolean
  downloadLoading: boolean
  canDeliver: boolean
  canAcceptDelivery: boolean
}>()

const emit = defineEmits<{
  retry: []
  'request-history': []
  payment: []
  'card-action': [card: ConversationCardMeta, message?: RequirementConversationMessage]
  deliver: []
  accept: []
}>()
</script>

<template>
  <!-- 接手前历史沟通未公开的提示条：文案与区段列表在 HistoryDisclosureNotice 里，
       申请接口由 useHistoryDisclosure 调，这里只把区段与状态传下去 -->
  <HistoryDisclosureNotice
    :segments="hiddenSegments"
    :can-request="canRequestHistory"
    :requesting="historyRequesting"
    @request="emit('request-history')"
  />
  <div v-if="loading" class="conversation-modal__empty">
    <TIcon>
      <ChatDotRound />
    </TIcon>
    <span>会话加载中...</span>
  </div>
  <div v-else-if="errorMessage" class="conversation-modal__empty conversation-modal__empty--error">
    <span>{{ errorMessage }}</span>
    <button type="button" @click="emit('retry')">重试</button>
  </div>
  <div v-else-if="messageCount === 0" class="conversation-modal__empty">
    <TIcon>
      <ChatDotRound />
    </TIcon>
    <span>{{
      hiddenSegments.length ? '此前的沟通记录未公开，暂时没有可查看的消息' : '暂无消息'
    }}</span>
  </div>
  <template v-else>
    <template v-for="row in items" :key="row.key">
      <div v-if="row.kind === 'date'" class="conversation-date-pill">{{ row.label }}</div>
      <ConversationCardItem
        v-else-if="row.kind === 'card' && row.card"
        :card="row.card"
        :card-side="row.cardSide"
        :created-at="row.createdAt"
        :message="row.message"
        :download-loading="downloadLoading"
        :can-deliver="canDeliver"
        :can-accept-delivery="canAcceptDelivery"
        @payment="emit('payment')"
        @action="(card, message) => emit('card-action', card, message)"
        @deliver="emit('deliver')"
        @accept="emit('accept')"
      />
      <ConversationMessageItem
        v-else-if="row.message"
        :message="row.message"
        :mine="Boolean(row.mine)"
        :show-avatar="Boolean(row.showAvatar)"
        :previous-developer="Boolean(row.previousDeveloper)"
      />
    </template>
  </template>
</template>

<style scoped>
.conversation-modal__empty {
  color: #64748b;
}

.conversation-modal__empty--error {
  color: #b42318;
  gap: 12px;
}

.conversation-modal__empty--error button {
  border: 1px solid rgba(180, 35, 24, 0.24);
  border-radius: 10px;
  background: #fff7f5;
  color: #b42318;
  padding: 7px 12px;
  cursor: pointer;
}

.conversation-modal__empty {
  align-content: center;
  gap: 10px;
  min-height: 220px;
  text-align: center;
  display: grid;
  place-items: center;
}

.conversation-modal__empty .t73-icon {
  color: var(--73-accent);
  font-size: 30px;
}

.conversation-date-pill {
  max-width: 880px;
}

.conversation-date-pill {
  flex: 0 0 auto;
  width: max-content;
  max-width: 100%;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  margin-bottom: 10px;
  margin: 2px auto 12px;
  padding: 4px 11px;
  border: 1px solid rgba(209, 222, 239, 0.86);
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  box-shadow: 0 8px 18px rgba(71, 102, 148, 0.08);
}
</style>
