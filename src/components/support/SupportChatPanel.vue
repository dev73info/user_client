<script setup lang="ts">
import { computed } from 'vue'

import type { SupportMessage } from '@/api/support'

const props = defineProps<{
  side: 'left' | 'right'
  connected: boolean
  loading: boolean
  sending: boolean
  messages: Array<SupportMessage & { time: string }>
  input: string
  error: string
  setBodyRef: (el: unknown) => void
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'update:input', value: string): void
  (event: 'send'): void
}>()

const inputModel = computed({
  get: () => props.input,
  set: (value: string) => emit('update:input', value),
})
</script>

<template>
  <section
    class="support-panel"
    :class="side === 'left' ? 'support-panel--left' : 'support-panel--right'"
    role="dialog"
    aria-label="在线客服"
  >
    <header class="support-panel__head">
      <div>
        <h2 class="support-panel__title">在线客服</h2>
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
        v-for="message in messages"
        :key="message.id"
        class="support-msg"
        :class="`support-msg--${message.sender_role === 'user' ? 'user' : 'agent'}`"
      >
        <div class="support-msg__bubble">{{ message.content }}</div>
        <span class="support-msg__time">{{ message.time }}</span>
      </div>
    </div>

    <p v-if="error" class="support-error" role="alert">{{ error }}</p>

    <footer class="support-panel__foot">
      <textarea
        v-model="inputModel"
        class="support-input"
        rows="2"
        maxlength="5000"
        placeholder="请输入消息，Enter 发送"
        aria-label="客服消息"
        @keydown.enter.exact.prevent="emit('send')"
      />
      <button
        type="button"
        class="support-send"
        :disabled="!input.trim() || loading || sending"
        @click="emit('send')"
      >
        {{ sending ? '发送中…' : '发送' }}
      </button>
    </footer>
  </section>
</template>

<style scoped src="./support-chat-panel.css"></style>
