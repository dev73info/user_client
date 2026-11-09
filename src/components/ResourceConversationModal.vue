<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { RequirementConversationDetail } from '@/api/conversations'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import ConversationComposer from '@/components/conversation/ConversationComposer.vue'
import ConversationMessageStream from '@/components/conversation/ConversationMessageStream.vue'
import ConversationModalHeader from '@/components/conversation/ConversationModalHeader.vue'
import { useConversationComposer } from '@/composables/useConversationComposer'
import { useConversationIdentity } from '@/composables/useConversationIdentity'
import { useConversationTimeline } from '@/composables/useConversationTimeline'
import { useResourceConversationSession } from '@/composables/useResourceConversationSession'

/**
 * 插件（资源）咨询会话：购买者 ↔ 作者。
 *
 * 与需求会话共用消息流、作曲器、会话头与外壳样式；差异只在取数：
 * - 从插件详情页进入时只有 `resourceId`，后端按「资源 + 当前买家」补建会话；
 * - 从消息中心进入时带 `conversationId`，作者按会话编号读取自己的买家咨询。
 *
 * 需求会话特有的业务工具条、历史沟通表决、需求详情抽屉在这里一概不出现。
 */
const props = defineProps<{
  visible: boolean
  token: string
  resourceId?: number | null
  conversationId?: string | null
  title?: string
  currentUsername?: string
  displayMode?: 'modal' | 'inline'
}>()

const emit = defineEmits<{
  close: []
  updated: [detail: RequirementConversationDetail]
}>()

const messageListRef = ref<HTMLElement | null>(null)
const composerRef = ref<InstanceType<typeof ConversationComposer> | null>(null)

const {
  loading,
  errorMessage,
  realtimeStatus,
  realtimeError,
  conversation,
  messages,
  conversationClosed,
  scrollToBottom,
  load,
  startRealtime,
  stopRealtime,
  resetReadMarker,
  applyDetail,
} = useResourceConversationSession(() => ({
  token: props.token,
  resourceId: props.resourceId,
  conversationId: props.conversationId,
  visible: props.visible,
  onUpdated: (next) => emit('updated', next),
  scrollContainer: () => messageListRef.value,
}))

const {
  isInline,
  closeActionLabel,
  viewerRole,
  conversationTitle,
  headerPeerLabel,
  peerInitial,
  realtimeStatusLabel,
} = useConversationIdentity(() => ({
  title: props.title,
  requirementId: props.resourceId ? `插件 #${props.resourceId}` : '',
  currentUsername: props.currentUsername,
  displayMode: props.displayMode,
  conversation: conversation.value,
  realtimeStatus: realtimeStatus.value,
}))

const { timelineItems } = useConversationTimeline(() => ({
  messages: messages.value,
  currentUsername: props.currentUsername,
  requirementId: '',
  viewerRole: viewerRole.value,
  conversation: conversation.value,
}))

/** 插件咨询没有关闭流程，也没有需求归档；只有会话本身的关闭状态会锁住输入。 */
const composerLocked = computed(() => conversationClosed.value)

const {
  draft,
  sending,
  sendError,
  attachmentError,
  attachmentDraft,
  canSend,
  submitMessage,
  resetComposer,
  clearAttachmentDraft,
  applyAttachmentFile,
} = useConversationComposer(() => ({
  token: props.token,
  conversationId: conversation.value?.conversation_id,
  locked: composerLocked.value,
  archived: false,
  loading: loading.value,
  onSent: applyDetail,
  closeEmojiPanel: () => composerRef.value?.closeEmojiPanel(),
  scrollToBottom,
}))

watch(
  () => [props.visible, props.token, props.resourceId, props.conversationId] as const,
  ([visible]) => {
    stopRealtime()
    // 换了会话就重新开始报到已读：上一个会话报过的消息 id 与本会话无关
    resetReadMarker()
    if (visible) {
      void load()
      startRealtime()
      return
    }
    resetComposer()
    errorMessage.value = ''
  },
  { immediate: true },
)

function closeModal() {
  if (sending.value) {
    return
  }
  emit('close')
}

function handleBackdropClick() {
  if (!isInline.value) {
    closeModal()
  }
}
</script>

<template>
  <Teleport to="body" :disabled="isInline">
    <div
      v-if="visible"
      class="conversation-modal-wrap"
      :class="{ 'conversation-modal-wrap--inline': isInline }"
      @click.self="handleBackdropClick"
    >
      <section class="conversation-modal" aria-label="插件咨询会话">
        <WorkbenchBarSlot :disabled="!isInline">
          <ConversationModalHeader
            :close-action-label="closeActionLabel"
            :peer-initial="peerInitial"
            :conversation-title="conversationTitle"
            :peer-label="headerPeerLabel"
            :realtime-status="realtimeStatus"
            :realtime-error="realtimeError"
            :realtime-status-label="realtimeStatusLabel"
            :detail-open="false"
            :detail-available="false"
            :loading="loading"
            @close="closeModal"
            @refresh="load"
          />
        </WorkbenchBarSlot>

        <div ref="messageListRef" class="conversation-modal__messages">
          <ConversationMessageStream
            :items="timelineItems"
            :loading="loading"
            :error-message="errorMessage"
            :message-count="messages.length"
            :hidden-segments="[]"
            :can-request-history="false"
            :history-requesting="false"
            :download-loading="false"
            :can-deliver="false"
            :can-accept-delivery="false"
            @retry="load"
          />
        </div>

        <ConversationComposer
          ref="composerRef"
          :draft="draft"
          :sending="sending"
          :loading="loading"
          :locked="composerLocked"
          :conversation-closed="conversationClosed"
          :requirement-archived="false"
          :can-send="canSend"
          :send-error="sendError"
          :attachment-error="attachmentError"
          :attachment="attachmentDraft"
          @update:draft="draft = $event"
          @submit="submitMessage"
          @attach-file="applyAttachmentFile"
          @clear-attachment="clearAttachmentDraft"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./conversation/conversation-modal-shell.css"></style>
