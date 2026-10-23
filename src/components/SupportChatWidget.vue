<script setup lang="ts">
/**
 * 在线客服浮窗：贴边侧签（可拖拽换边 / 上下调整，点击展开收起）+ 聊天面板。
 *
 * 拆分（R047）：会话与 WebSocket 在 `support/useSupportChatSession.ts`，侧签吸附与拖拽在
 * `support/useSupportChatDrag.ts`，面板模板与样式在 `support/SupportChatPanel.vue`（样式
 * `support-chat-panel.css`），本组件只剩外壳、侧签与挂载 / 卸载时的接线；
 * 侧签与外壳样式在同目录 `support-chat-fab.css`。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'

import SupportChatPanel from '@/components/support/SupportChatPanel.vue'
import { useSupportChatDrag } from '@/components/support/useSupportChatDrag'
import { useSupportChatSession } from '@/components/support/useSupportChatSession'

const {
  channelEnabled,
  opened,
  loading,
  messages,
  setChatBodyRef,
  input,
  error,
  connected,
  toggleOpen,
  send,
  connectWs,
  resolveChannelEnabled,
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

const openLabel = computed(() => (opened.value ? '收起' : '在线客服'))

onMounted(async () => {
  const enabled = await resolveChannelEnabled()
  if (!enabled) return
  centerVertically()
  window.addEventListener('resize', handleViewportResize)
  connectWs()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleViewportResize)
  detachDragListeners()
  dispose()
})
</script>

<template>
  <div v-if="channelEnabled" class="support-widget" :style="widgetStyle">
    <!-- 聊天面板 -->
    <Transition name="support-pop">
      <SupportChatPanel
        v-if="opened"
        :side="side"
        :connected="connected"
        :loading="loading"
        :messages="messages"
        :input="input"
        :error="error"
        :set-body-ref="setChatBodyRef"
        @close="toggleOpen"
        @update:input="input = $event"
        @send="send"
      />
    </Transition>

    <!-- 侧边签：贴左/右边缘，可拖拽换边+上下调整，点击展开/收起 -->
    <button
      type="button"
      class="support-fab"
      :class="[
        side === 'left' ? 'support-fab--left' : 'support-fab--right',
        { 'is-dragging': dragging },
      ]"
      :aria-label="openLabel"
      @pointerdown="onDragStart"
    >
      <svg
        v-if="!opened"
        class="support-fab__icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M12 1a9 9 0 0 0-9 9v7a3 3 0 0 0 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3a3 3 0 0 0 3-3v-7a9 9 0 0 0-9-9z"
        />
      </svg>
      <svg
        v-else
        class="support-fab__icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.29 6.29-6.29z"
        />
      </svg>
      <span class="support-fab__text">在线客服</span>
    </button>
  </div>
</template>

<style scoped src="./support/support-chat-fab.css"></style>
