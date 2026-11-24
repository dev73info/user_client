<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import SupportChatPanel from '@/components/support/SupportChatPanel.vue'
import { useSupportChatDrag } from '@/components/support/useSupportChatDrag'
import { useSupportChatSession } from '@/components/support/useSupportChatSession'

const session = useSupportChatSession()
const {
  channelEnabled,
  opened,
  loading,
  sending,
  messages,
  input,
  error,
  connected,
  conversations,
  unread,
  supportToken,
  isGuest,
  activeStatus,
  activeConversation,
  availabilityOnline,
  availabilityLoaded,
  onlineAgents,
  historyOpen,
  unavailable,
  toggleOpen,
  toggleHistory,
  openConversation,
  send,
  resolveChannelEnabled,
  setChatBodyRef,
  dispose,
} = session
const {
  pending: pendingAttachments,
  uploading: attachmentUploading,
  error: attachmentError,
  upload: uploadAttachment,
  remove: removeAttachment,
} = session.attachments
const {
  submitting: satisfactionSubmitting,
  error: satisfactionError,
  submit: submitSatisfaction,
} = session.satisfaction
const iconOnly = ref(false)
const openLabel = computed(() => {
  const unreadSuffix = unread.value > 0 ? `（${unread.value} 条未读）` : ''
  if (opened.value) return `关闭在线客服${unreadSuffix}`
  if (iconOnly.value) return `打开在线客服${unreadSuffix}`
  return `在线客服${unreadSuffix}，点击打开`
})
const dismissLabel = computed(() => (opened.value ? '关闭并收为竖浮窗' : '收起为竖浮窗'))

function handleFabTap() {
  if (!opened.value) iconOnly.value = true
  void toggleOpen()
}

const {
  side,
  dragging,
  widgetStyle,
  onDragStart,
  handleViewportResize,
  detachDragListeners,
  centerVertically,
} = useSupportChatDrag(handleFabTap)
let disposed = false

function dismiss() {
  if (opened.value) void toggleOpen()
  iconOnly.value = false
}

onMounted(async () => {
  const enabled = await resolveChannelEnabled()
  if (disposed || !enabled) return
  centerVertically()
  window.addEventListener('resize', handleViewportResize)
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('resize', handleViewportResize)
  detachDragListeners()
  dispose()
})
</script>

<template>
  <div
    v-if="channelEnabled"
    class="support-widget"
    :class="{ 'is-open': opened, 'is-icon': iconOnly }"
    :style="widgetStyle"
  >
    <Transition name="support-pop">
      <SupportChatPanel
        v-if="opened"
        :side="side"
        :support-token="supportToken"
        :is-guest="isGuest"
        :connected="connected"
        :loading="loading"
        :sending="sending"
        :uploading="attachmentUploading"
        :messages="messages"
        :input="input"
        :error="error"
        :conversations="conversations"
        :active-conversation="activeConversation"
        :active-status="activeStatus"
        :history-open="historyOpen"
        :unavailable="unavailable"
        :availability-online="availabilityOnline"
        :availability-loaded="availabilityLoaded"
        :online-agents="onlineAgents"
        :pending-attachments="pendingAttachments"
        :attachment-error="attachmentError"
        :satisfaction-submitting="satisfactionSubmitting"
        :satisfaction-error="satisfactionError"
        :set-body-ref="setChatBodyRef"
        @close="toggleOpen"
        @update:input="input = $event"
        @send="send"
        @quick-send="send"
        @attach="uploadAttachment"
        @remove-attachment="removeAttachment"
        @rate="submitSatisfaction"
        @toggle-history="toggleHistory"
        @open-conversation="openConversation"
      />
    </Transition>

    <button
      type="button"
      class="support-fab"
      :class="[
        side === 'left' ? 'support-fab--left' : 'support-fab--right',
        { 'is-dragging': dragging },
      ]"
      :aria-label="openLabel"
      :aria-expanded="opened"
      :title="iconOnly ? '在线客服' : undefined"
      @pointerdown="onDragStart"
      @keydown.enter.prevent="handleFabTap"
      @keydown.space.prevent="handleFabTap"
    >
      <span v-if="iconOnly" class="support-fab__stage" aria-hidden="true">
        <span class="support-fab__sprite support-fab__sprite--idle"></span>
        <span class="support-fab__sprite support-fab__sprite--wave"></span>
      </span>
      <span v-else class="support-fab__text">在线客服</span>
      <span v-if="unread > 0 && !opened" class="support-fab__badge">{{
        unread > 99 ? '99+' : unread
      }}</span>
    </button>

    <button
      v-if="iconOnly"
      type="button"
      class="support-widget__dismiss"
      :aria-label="dismissLabel"
      :title="dismissLabel"
      @pointerdown.stop.prevent
      @click.stop="dismiss"
    >
      <span aria-hidden="true">×</span>
    </button>
  </div>
</template>

<style scoped src="./support/support-chat-fab.css"></style>
<style scoped src="./support/support-chat-fab-actions.css"></style>
<style scoped src="./support/support-chat-fab-responsive.css"></style>
