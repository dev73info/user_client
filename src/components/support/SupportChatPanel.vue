<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { SupportAttachment, SupportConversation, SupportMessage } from '@/api/support'

import SupportChatComposer from './SupportChatComposer.vue'
import SupportHistoryList from './SupportHistoryList.vue'
import SupportMessageAttachments from './SupportMessageAttachments.vue'
import SupportSatisfactionCard from './SupportSatisfactionCard.vue'

const props = defineProps<{
  side: 'left' | 'right'
  authenticated: boolean
  connected: boolean
  loading: boolean
  sending: boolean
  uploading: boolean
  messages: Array<SupportMessage & { time: string }>
  input: string
  error: string
  conversations: SupportConversation[]
  activeConversation: SupportConversation | null
  activeStatus: 'open' | 'closed' | null
  historyOpen: boolean
  unavailable: boolean
  availabilityOnline: boolean
  availabilityLoaded: boolean
  onlineAgents: number
  pendingAttachments: SupportAttachment[]
  attachmentError: string
  satisfactionSubmitting: boolean
  satisfactionError: string
  setBodyRef: (el: unknown) => void
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'login'): void
  (event: 'update:input', value: string): void
  (event: 'send'): void
  (event: 'attach', files: FileList): void
  (event: 'remove-attachment', id: number): void
  (event: 'rate', rating: number, comment: string): void
  (event: 'toggle-history'): void
  (event: 'open-conversation', id: number): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isPhone = ref(false)
let scrollWrap: HTMLElement | null = null
let scrollLocked = false

const availabilityText = computed(() => {
  if (!props.authenticated) return '登录后即可咨询'
  if (props.availabilityOnline) {
    return props.onlineAgents > 0 ? `客服在线 · ${props.onlineAgents} 人` : '客服在线'
  }
  if (props.availabilityLoaded) return '客服离线，留言会尽快处理'
  return props.connected ? '等待客服状态…' : '连接中…'
})

const sessionText = computed(() => {
  if (props.activeStatus === 'closed') return '会话已结束，发送将创建新会话'
  if (props.authenticated && !props.connected) return '实时连接重连中'
  return ''
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

function lockScroll() {
  if (scrollLocked) return
  scrollLocked = true
  const wrap = document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
  if (wrap) {
    scrollWrap = wrap
    wrap.style.overflow = 'hidden'
  }
  document.body.style.overflow = 'hidden'
}

function unlockScroll() {
  if (!scrollLocked) return
  scrollLocked = false
  if (scrollWrap) {
    scrollWrap.style.overflow = ''
    scrollWrap = null
  }
  document.body.style.overflow = ''
}

function syncPhone() {
  const next = window.innerWidth <= 640
  if (next && !isPhone.value) lockScroll()
  if (!next && isPhone.value) unlockScroll()
  isPhone.value = next
}

onMounted(() => {
  textareaRef.value?.focus()
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', syncPhone)
  syncPhone()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', syncPhone)
  unlockScroll()
  document.querySelector<HTMLElement>('.support-fab')?.focus()
})
</script>

<template>
  <section
    class="support-panel"
    :class="side === 'left' ? 'support-panel--left' : 'support-panel--right'"
    role="dialog"
    :aria-modal="isPhone ? 'true' : undefined"
    aria-label="在线客服"
  >
    <header class="support-panel__head">
      <div class="support-panel__heading">
        <h2 class="support-panel__title">在线客服</h2>
        <span class="support-panel__status">
          <i
            class="support-panel__dot"
            :class="{ 'is-online': availabilityOnline }"
            aria-hidden="true"
          />
          {{ availabilityText }}
        </span>
        <span v-if="sessionText" class="support-panel__session">{{ sessionText }}</span>
      </div>
      <div class="support-panel__head-actions">
        <button type="button" class="support-panel__history-toggle" @click="emit('toggle-history')">
          {{ historyOpen ? '返回会话' : '历史会话' }}
        </button>
        <button
          type="button"
          class="support-panel__close"
          aria-label="关闭客服窗口"
          @click="emit('close')"
        >
          ×
        </button>
      </div>
    </header>

    <SupportHistoryList
      v-if="historyOpen"
      :conversations="conversations"
      @open="(id) => emit('open-conversation', id)"
    />

    <template v-else>
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
          <div v-if="message.content" class="support-msg__bubble">{{ message.content }}</div>
          <SupportMessageAttachments :attachments="message.attachments ?? []" />
          <span class="support-msg__time">{{ message.time }}</span>
        </div>
        <SupportSatisfactionCard
          :conversation="activeConversation"
          :submitting="satisfactionSubmitting"
          :error="satisfactionError"
          @submit="(rating, comment) => emit('rate', rating, comment)"
        />
      </div>

      <p v-if="error" class="support-error" role="alert">{{ error }}</p>
      <p v-else-if="unavailable" class="support-error" role="alert">实时连接已断开</p>

      <SupportChatComposer
        :authenticated="authenticated"
        :input="input"
        :sending="sending"
        :uploading="uploading"
        :pending-attachments="pendingAttachments"
        :attachment-error="attachmentError"
        @update:input="(value) => emit('update:input', value)"
        @send="emit('send')"
        @login="emit('login')"
        @attach="(files) => emit('attach', files)"
        @remove-attachment="(id) => emit('remove-attachment', id)"
      />
    </template>
  </section>
</template>

<style scoped src="./support-chat-panel.css"></style>
