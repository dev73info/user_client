<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { SupportConversation, SupportMessage } from '@/api/support'

const props = defineProps<{
  side: 'left' | 'right'
  connected: boolean
  loading: boolean
  sending: boolean
  messages: Array<SupportMessage & { time: string }>
  input: string
  error: string
  conversations: SupportConversation[]
  activeStatus: 'open' | 'closed' | null
  historyOpen: boolean
  unavailable: boolean
  setBodyRef: (el: unknown) => void
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'update:input', value: string): void
  (event: 'send'): void
  (event: 'toggle-history'): void
  (event: 'open-conversation', id: number): void
}>()

const inputModel = computed({
  get: () => props.input,
  set: (value: string) => emit('update:input', value),
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const isPhone = ref(false)
let scrollWrap: HTMLElement | null = null
let scrollLocked = false

const statusText = computed(() => {
  if (props.unavailable) return '实时连接已断开'
  if (!props.connected) return '连接中…'
  if (props.activeStatus === 'closed') return '会话已结束，发送将创建新会话'
  return '已连接'
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

/** Enter 发送、Shift+Enter 换行；输入法组合期内的回车不算发送。 */
function onInputKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  if (props.input.trim() && !props.sending && !props.loading) emit('send')
}

/** 本仓真正滚动的是工作台滚动容器，body 锁不住它。 */
function lockScroll() {
  if (scrollLocked) return
  scrollLocked = true
  const wrap = document.querySelector<HTMLElement>('.t73-scrollbar__wrap')
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

/** 全屏只在手机档生效；跨档时同步滚动锁与 aria-modal。 */
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
        <span class="support-panel__status">{{ statusText }}</span>
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

    <div v-if="historyOpen" class="support-history">
      <p v-if="!conversations.length" class="support-hint">还没有历史会话</p>
      <button
        v-for="item in conversations"
        :key="item.id"
        type="button"
        class="support-history__item"
        @click="emit('open-conversation', item.id)"
      >
        <span class="support-history__text">{{ item.last_message || '（无消息）' }}</span>
        <span class="support-history__meta">
          {{ item.status === 'open' ? '进行中' : '已结束' }}
        </span>
      </button>
    </div>

    <div v-else :ref="setBodyRef" class="support-panel__body">
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

    <footer v-if="!historyOpen" class="support-panel__foot">
      <textarea
        ref="textareaRef"
        v-model="inputModel"
        class="support-input"
        rows="2"
        maxlength="5000"
        placeholder="请输入消息，Enter 发送，Shift+Enter 换行"
        aria-label="客服消息"
        @keydown="onInputKeydown"
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
