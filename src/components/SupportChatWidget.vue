<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import { useAuthStore } from '@/stores/auth'
import {
  createSupportConversation,
  getSupportConversationDetail,
  listMySupportConversations,
  sendSupportMessage,
  supportConversationWsUrl,
  type SupportConversationDetail,
  type SupportMessage,
} from '@/api/support'

const auth = useAuthStore()

const opened = ref(false)
const openLabel = computed(() => (opened.value ? '收起' : '在线客服'))

const widgetRef = ref<HTMLElement | null>(null)
const side = ref<'left' | 'right'>('right')
const top = ref(0)
const dragging = ref(false)
const dragLeft = ref<number | null>(null)
const dragTop = ref<number | null>(null)
let startX = 0
let startY = 0
let startTop = 0
let startContainerLeft = 0
let moveHandler: ((e: PointerEvent) => void) | null = null
let upHandler: ((e: PointerEvent) => void) | null = null

// 侧边签宽度（近似，用于吸附计算）
const TAB = 48

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function currentContainerLeft(): number {
  return side.value === 'right' ? window.innerWidth - TAB : 0
}

const widgetStyle = computed(() => {
  if (dragging.value && dragLeft.value !== null && dragTop.value !== null) {
    return { top: `${dragTop.value}px`, left: `${dragLeft.value}px` }
  }
  const style: Record<string, string> = { top: `${top.value}px` }
  if (side.value === 'right') style.right = '0px'
  else style.left = '0px'
  return style
})

function attachDragListeners() {
  moveHandler = (e: PointerEvent) => onDragMove(e)
  upHandler = (e: PointerEvent) => onDragEnd(e)
  window.addEventListener('pointermove', moveHandler)
  window.addEventListener('pointerup', upHandler)
  window.addEventListener('pointercancel', upHandler)
}

function detachDragListeners() {
  if (moveHandler) window.removeEventListener('pointermove', moveHandler)
  if (upHandler) {
    window.removeEventListener('pointerup', upHandler)
    window.removeEventListener('pointercancel', upHandler)
  }
  moveHandler = null
  upHandler = null
}

function onDragStart(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  startX = e.clientX
  startY = e.clientY
  startTop = top.value
  startContainerLeft = currentContainerLeft()
  dragging.value = true
  dragLeft.value = startContainerLeft
  dragTop.value = startTop
  attachDragListeners()
}

function onDragMove(e: PointerEvent) {
  if (!dragging.value) return
  dragLeft.value = clamp(
    startContainerLeft + (e.clientX - startX),
    0,
    window.innerWidth - TAB,
  )
  dragTop.value = clamp(startTop + (e.clientY - startY), 8, window.innerHeight - 140)
}

function onDragEnd(e: PointerEvent) {
  if (!dragging.value) return
  detachDragListeners()

  const distance = Math.hypot(e.clientX - startX, e.clientY - startY)
  const left = dragLeft.value ?? startContainerLeft
  const topNow = dragTop.value ?? startTop

  dragging.value = false
  dragLeft.value = null
  dragTop.value = null

  // 位移很小视为点击：展开/收起
  if (distance < 6) {
    toggleOpen()
    return
  }

  // 水平按靠近哪一侧贴边吸附；垂直方向自由，仅限制在可视范围内
  const centerX = left + TAB / 2
  side.value = centerX < window.innerWidth / 2 ? 'left' : 'right'
  top.value = clamp(topNow, 8, window.innerHeight - 140)
}

const loading = ref(false)
const activeConversationId = ref<number | null>(null)
const messages = ref<Array<SupportMessage & { time: string }>>([])
const chatBodyRef = ref<HTMLElement | null>(null)
const input = ref('')
const error = ref('')
const connected = ref(false)

let ws: WebSocket | null = null
let reconnectTimer: number | null = null

function formatTime(value: string): string {
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function setMessages(items: SupportMessage[]) {
  messages.value = items.map((m) => ({ ...m, time: formatTime(m.created_at) }))
  void scrollToBottom()
}

async function scrollToBottom() {
  await nextTick()
  if (chatBodyRef.value) chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
}

async function ensureConversation() {
  loading.value = true
  error.value = ''
  try {
    const list = await listMySupportConversations(auth.token)
    const current = list.find((c) => c.status === 'open') ?? list[0]
    if (current) {
      activeConversationId.value = current.id
      const detail = await getSupportConversationDetail(auth.token, current.id)
      setMessages(detail.messages)
    } else {
      activeConversationId.value = null
      messages.value = []
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载会话失败'
  } finally {
    loading.value = false
  }
}

async function toggleOpen() {
  opened.value = !opened.value
  if (opened.value && activeConversationId.value === null && !loading.value) {
    await ensureConversation()
  }
}

async function send() {
  const text = input.value.trim()
  if (!text || loading.value) return
  error.value = ''
  try {
    if (activeConversationId.value === null) {
      const conv = await createSupportConversation(auth.token, text)
      activeConversationId.value = conv.id
      const detail = await getSupportConversationDetail(auth.token, conv.id)
      setMessages(detail.messages)
    } else {
      const sent = await sendSupportMessage(auth.token, activeConversationId.value, text)
      // WebSocket 可能已把这条消息推来，按 id 去重避免重复
      if (!messages.value.some((m) => m.id === sent.id)) {
        messages.value.push({ ...sent, time: formatTime(sent.created_at) })
      }
      await scrollToBottom()
    }
    input.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : '发送消息失败'
  }
}

function connectWs() {
  if (!auth.token) return
  ws = new WebSocket(supportConversationWsUrl(auth.token))
  ws.onopen = () => {
    connected.value = true
  }
  ws.onmessage = (ev) => {
    try {
      const detail = JSON.parse(ev.data) as SupportConversationDetail
      if (activeConversationId.value === detail.conversation.id) {
        setMessages(detail.messages)
        // 用户正在查看该会话：有新消息时实时标记已读，客服端才能显示“已读”
        if (opened.value) {
          const lastUserRead = detail.conversation.user_last_read_message_id ?? 0
          const maxId = (detail.messages ?? []).reduce((mx, m) => Math.max(mx, m.id), 0)
          if (maxId > lastUserRead) {
            void getSupportConversationDetail(auth.token, detail.conversation.id).catch(() => {})
          }
        }
      }
    } catch {
      // ignore malformed payload
    }
  }
  ws.onclose = () => {
    connected.value = false
    ws = null
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    reconnectTimer = window.setTimeout(connectWs, 3000)
  }
  ws.onerror = () => {
    ws?.close()
  }
}

onMounted(() => {
  top.value = clamp((window.innerHeight - 140) / 2, 8, window.innerHeight - 140)
  connectWs()
})

onBeforeUnmount(() => {
  detachDragListeners()
  if (reconnectTimer) window.clearTimeout(reconnectTimer)
  ws?.close()
  ws = null
})
</script>

<template>
  <div ref="widgetRef" class="support-widget" :style="widgetStyle">
    <!-- 聊天面板 -->
    <Transition name="support-pop">
      <div
        v-if="opened"
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
          <button type="button" class="support-panel__close" aria-label="关闭客服窗口" @click="toggleOpen">
            ×
          </button>
        </header>

        <div ref="chatBodyRef" class="support-panel__body">
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
            v-model="input"
            class="support-input"
            rows="2"
            placeholder="请输入消息，Enter 发送"
            @keydown.enter.prevent="send"
          />
          <button type="button" class="support-send" :disabled="!input.trim() || loading" @click="send">
            发送
          </button>
        </footer>
      </div>
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

<style scoped>
.support-widget {
  position: fixed;
  z-index: 9999;
}

.support-fab {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 48px;
  height: 140px;
  padding: 10px 0;
  border: none;
  background: #2ba88f;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  touch-action: none;
  user-select: none;
}

.support-fab--right {
  right: 0;
  border-radius: 10px 0 0 10px;
}

.support-fab--left {
  left: 0;
  border-radius: 0 10px 10px 0;
}

.support-fab.is-dragging {
  cursor: grabbing;
}

.support-fab:hover {
  background: #1f8f76;
}

.support-fab__icon {
  display: inline-flex;
  width: 22px;
  height: 22px;
}

.support-fab__text {
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  font-size: 13px;
}

.support-panel {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 360px;
  max-width: calc(100vw - 56px);
  height: 480px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  overflow: hidden;
}

.support-panel--right {
  right: 48px;
}

.support-panel--left {
  left: 48px;
}

.support-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #2ba88f;
  color: #fff;
}

.support-panel__title {
  margin: 0;
  font-size: 15px;
}

.support-panel__status {
  font-size: 12px;
  opacity: 0.9;
}

.support-panel__close {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.support-panel__body {
  flex: 1;
  padding: 14px;
  overflow-y: auto;
  background: #f7f9fb;
}

.support-hint {
  text-align: center;
  color: #909399;
  font-size: 13px;
  margin-top: 24px;
}

.support-msg {
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
  max-width: 80%;
}

.support-msg--user {
  align-items: flex-end;
  margin-left: auto;
}

.support-msg--agent {
  align-items: flex-start;
}

.support-msg__bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.support-msg--user .support-msg__bubble {
  background: #2ba88f;
  color: #fff;
}

.support-msg--agent .support-msg__bubble {
  background: #fff;
  border: 1px solid #ebeef5;
  color: #303133;
}

.support-msg__time {
  margin-top: 4px;
  font-size: 11px;
  color: #c0c4cc;
}

.support-error {
  margin: 0;
  padding: 6px 16px;
  font-size: 12px;
  color: #f56c6c;
  background: #fef0f0;
}

.support-panel__foot {
  display: flex;
  gap: 8px;
  padding: 12px;
  align-items: flex-end;
  border-top: 1px solid #f0f2f5;
  /* 覆盖全局 footer 样式，避免出现灰色大块和错误间距 */
  margin-top: 0;
  background: #fff;
  text-align: left;
}

.support-input {
  flex: 1;
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 14px;
  resize: none;
  outline: none;
}

.support-input:focus {
  border-color: #2ba88f;
}

.support-send {
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 6px;
  background: #2ba88f;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
}

.support-send:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.support-pop-enter-active,
.support-pop-leave-active {
  transition: all 0.2s ease;
}

.support-pop-enter-from,
.support-pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
