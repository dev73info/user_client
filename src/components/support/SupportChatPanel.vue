<script setup lang="ts">
/**
 * 在线客服的聊天面板：标题栏、消息列表、错误行与输入区。
 *
 * 从 `SupportChatWidget.vue` 拆出，模板逐节点搬移；消息滚动容器的 ref 由宿主用
 * 函数式 `ref`（`setBodyRef`）注入，所以「新消息到达即滚到底」的时序与拆分前一致。
 * 样式随节点搬到同目录 `support-chat-panel.css`（scoped）。
 */
import { computed } from 'vue'

import type { SupportMessage } from '@/api/support'

const props = defineProps<{
  side: 'left' | 'right'
  connected: boolean
  loading: boolean
  messages: Array<SupportMessage & { time: string }>
  input: string
  error: string
  setBodyRef: (el: unknown) => void
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update:input', value: string): void
  (e: 'send'): void
}>()

/** 输入框仍用 `v-model`（而不是 `:value` + `@input`）：DOM 上不落 `value` 属性，与拆分前一致。 */
const inputModel = computed({
  get: () => props.input,
  set: (value: string) => emit('update:input', value),
})
</script>

<template>
  <div
    class="support-panel"
    :class="side === 'left' ? 'support-panel--left' : 'support-panel--right'"
    role="dialog"
    aria-label="在线客服"
  >
    <header class="support-panel__head">
      <div>
        <h3 class="support-panel__title">在线客服</h3>
        <span class="support-panel__status">
          {{ connected ? '已连接，客服将及时回复' : '连接中…' }}
        </span>
      </div>
      <button
        type="button"
        class="support-panel__close"
        aria-label="关闭客服窗口"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div :ref="setBodyRef" class="support-panel__body">
      <div v-if="loading" class="support-hint">加载中…</div>
      <div v-else-if="messages.length === 0" class="support-hint">
        您好，请输入您的问题，我们会尽快回复您。
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="support-msg"
        :class="`support-msg--${msg.sender_role === 'user' ? 'user' : 'agent'}`"
      >
        <div class="support-msg__bubble">{{ msg.content }}</div>
        <span class="support-msg__time">{{ msg.time }}</span>
      </div>
    </div>

    <p v-if="error" class="support-error">{{ error }}</p>

    <footer class="support-panel__foot">
      <textarea
        v-model="inputModel"
        class="support-input"
        rows="2"
        placeholder="请输入消息，Enter 发送"
        @keydown.enter.prevent="emit('send')"
      />
      <button
        type="button"
        class="support-send"
        :disabled="!input.trim() || loading"
        @click="emit('send')"
      >
        发送
      </button>
    </footer>
  </div>
</template>

<style scoped src="./support-chat-panel.css"></style>
