<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { SupportAttachment, SupportConversation } from '@/api/support'
import type { SupportChatMessage } from './useSupportChatMessages'

import SupportChatComposer from './SupportChatComposer.vue'
import SupportHistoryList from './SupportHistoryList.vue'
import SupportMessageAttachments from './SupportMessageAttachments.vue'
import SupportSatisfactionCard from './SupportSatisfactionCard.vue'

const props = defineProps<{
  side: 'left' | 'right'
  supportToken: string
  isGuest: boolean
  connected: boolean
  loading: boolean
  sending: boolean
  uploading: boolean
  messages: SupportChatMessage[]
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
  (event: 'update:input', value: string): void
  (event: 'send'): void
  (event: 'quick-send', value: string): void
  (event: 'attach', files: FileList): void
  (event: 'remove-attachment', id: number): void
  (event: 'rate', rating: number, comment: string): void
  (event: 'toggle-history'): void
  (event: 'open-conversation', id: number): void
}>()

const quickTopics = ['如何发布需求？', '如何购买资源？', '支付遇到问题']
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isPhone = ref(false)
let scrollWrap: HTMLElement | null = null
let scrollLocked = false

const availabilityText = computed(() => {
  if (props.availabilityOnline) {
    return props.onlineAgents > 0 ? `客服在线 · ${props.onlineAgents} 人` : '客服在线'
  }
  if (props.availabilityLoaded) return '客服离线，留言会尽快处理'
  return props.connected ? '正在获取客服状态…' : '正在连接客服…'
})

const sessionText = computed(() => {
  if (props.activeStatus === 'closed') return '本次咨询已结束，继续发送会开启新咨询'
  if (!props.connected) return '消息可正常发送，实时连接重连中'
  return ''
})

const identityText = computed(() => (props.isGuest ? '访客咨询' : '账号咨询'))

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
      <div class="support-panel__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3.25a8.75 8.75 0 0 0-8.75 8.75v3.25c0 2.62 2.13 4.75 4.75 4.75h.75v-6.5H6.25V12A5.75 5.75 0 0 1 12 6.25c3.18 0 5.75 2.57 5.75 5.75v1.5H15v6.5h.75c2.62 0 4.75-2.13 4.75-4.75V12A8.75 8.75 0 0 0 12 3.25Z"
            fill="currentColor"
          />
        </svg>
      </div>
      <div class="support-panel__heading">
        <div class="support-panel__title-row">
          <h2 class="support-panel__title">在线客服</h2>
          <span class="support-panel__identity">{{ identityText }}</span>
        </div>
        <span class="support-panel__status">
          <i
            class="support-panel__dot"
            :class="{ 'is-online': availabilityOnline }"
            aria-hidden="true"
          />
          {{ availabilityText }}
        </span>
        <span class="support-panel__session">{{ sessionText }}</span>
      </div>
      <div class="support-panel__head-actions">
        <button
          type="button"
          class="support-panel__history-toggle"
          :aria-pressed="historyOpen"
          @click="emit('toggle-history')"
        >
          {{ historyOpen ? '返回咨询' : '历史咨询' }}
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
        <div v-if="loading && !messages.length" class="support-loading">
          <span class="support-loading__dot" />
          <span class="support-loading__dot" />
          <span class="support-loading__dot" />
        </div>
        <section v-else-if="messages.length === 0" class="support-welcome">
          <span class="support-welcome__eyebrow">无需登录 · 对话自动保存</span>
          <h3>您好，请告诉我遇到的问题</h3>
          <p>客服在线时会立即接入；离线时也可以先留言，我们会尽快回复。</p>
          <div class="support-welcome__topics">
            <button
              v-for="topic in quickTopics"
              :key="topic"
              type="button"
              @click="emit('quick-send', topic)"
            >
              <span>{{ topic }}</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="m7.5 5 5 5-5 5"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </div>
        </section>

        <template v-for="message in messages" :key="message.id">
          <div v-if="message.showDay" class="support-day">{{ message.day }}</div>
          <div
            class="support-msg"
            :class="[
              `support-msg--${message.sender_role === 'user' ? 'user' : 'agent'}`,
              { 'is-continuation': message.continuation },
            ]"
          >
            <span
              v-if="message.sender_role !== 'user' && !message.continuation"
              class="support-msg__avatar"
              aria-hidden="true"
            >
              客
            </span>
            <div class="support-msg__main">
              <span
                v-if="message.sender_role !== 'user' && !message.continuation"
                class="support-msg__sender"
              >
                在线客服
              </span>
              <div v-if="message.content" class="support-msg__bubble">{{ message.content }}</div>
              <SupportMessageAttachments
                :attachments="message.attachments ?? []"
                :token="supportToken"
              />
              <span v-if="!message.continuation" class="support-msg__time">
                {{ message.time }}
              </span>
            </div>
          </div>
        </template>

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
        :input="input"
        :sending="sending"
        :uploading="uploading"
        :pending-attachments="pendingAttachments"
        :attachment-error="attachmentError"
        @update:input="(value) => emit('update:input', value)"
        @send="emit('send')"
        @attach="(files) => emit('attach', files)"
        @remove-attachment="(id) => emit('remove-attachment', id)"
      />
    </template>
  </section>
</template>

<style scoped src="./support-chat-panel.css"></style>
<style scoped src="./support-chat-messages.css"></style>
