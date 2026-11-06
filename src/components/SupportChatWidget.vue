<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'

import SupportChatPanel from '@/components/support/SupportChatPanel.vue'
import { useSupportChatDrag } from '@/components/support/useSupportChatDrag'
import { useSupportChatSession } from '@/components/support/useSupportChatSession'

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
  activeStatus,
  historyOpen,
  unavailable,
  toggleOpen,
  toggleHistory,
  openConversation,
  send,
  resolveChannelEnabled,
  setChatBodyRef,
  dispose,
} = useSupportChatSession()
const {
  side,
  dragging,
  widgetStyle,
  onDragStart,
  handleViewportResize,
  detachDragListeners,
  centerVertically,
} = useSupportChatDrag(() => {
  void toggleOpen()
})
const openLabel = computed(() => {
  if (opened.value) return '收起在线客服'
  return unread.value > 0 ? `在线客服（${unread.value} 条未读）` : '在线客服'
})
let disposed = false

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
  <div v-if="channelEnabled" class="support-widget" :class="{ 'is-open': opened }" :style="widgetStyle">
    <Transition name="support-pop">
      <SupportChatPanel
        v-if="opened"
        :side="side"
        :connected="connected"
        :loading="loading"
        :sending="sending"
        :messages="messages"
        :input="input"
        :error="error"
        :conversations="conversations"
        :active-status="activeStatus"
        :history-open="historyOpen"
        :unavailable="unavailable"
        :set-body-ref="setChatBodyRef"
        @close="toggleOpen"
        @update:input="input = $event"
        @send="send"
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
      @pointerdown="onDragStart"
      @keydown.enter.prevent="toggleOpen"
      @keydown.space.prevent="toggleOpen"
    >
      <span class="support-fab__stage" aria-hidden="true">
        <span class="support-fab__sprite support-fab__sprite--idle"></span>
        <span class="support-fab__sprite support-fab__sprite--wave"></span>
        <span v-if="opened" class="support-fab__close">×</span>
        <span v-else-if="unread > 0" class="support-fab__badge">{{ unread > 99 ? '99+' : unread }}</span>
      </span>
      <span class="support-fab__text">在线客服</span>
    </button>
  </div>
</template>

<style scoped src="./support/support-chat-fab.css"></style>
