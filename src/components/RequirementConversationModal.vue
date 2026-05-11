<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowLeft,
  ChatDotRound,
  Close,
  MagicStick,
  Paperclip,
  Picture,
  Position,
  Refresh,
} from '@element-plus/icons-vue'

import * as userConversationApi from '@/api/conversations'
import * as devConversationApi from '@dev/api/conversations'
import type {
  RequirementConversationDetail,
  RequirementConversationMessage,
} from '@/api/conversations'
import { apiUrl } from '@/api/http'

const props = defineProps<{
  visible: boolean
  token: string
  requirementId: string
  title?: string
  currentUsername?: string
  apiMode?: 'user' | 'dev'
  displayMode?: 'modal' | 'inline'
}>()

const emit = defineEmits<{
  close: []
  updated: [detail: RequirementConversationDetail]
}>()

const detail = ref<RequirementConversationDetail | null>(null)
const loading = ref(false)
const sending = ref(false)
const draft = ref('')
const errorMessage = ref('')
const attachmentError = ref('')
const emojiPanelOpen = ref(false)
const draftInputRef = ref<HTMLTextAreaElement | null>(null)
const attachmentInputRef = ref<HTMLInputElement | null>(null)
const attachmentDraft = ref<ConversationAttachmentDraft | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
const realtimeStatus = ref<RealtimeStatus>('idle')
const realtimeError = ref('')
let stopRealtimeEvents: (() => void) | null = null

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

type ConversationAttachmentDraft = {
  file: File
  previewUrl: string
  name: string
  mimeType: string
  sizeLabel: string
}

type ConversationTimelineItem = {
  key: string
  kind: 'date' | 'message'
  label?: string
  message?: RequirementConversationMessage
  mine?: boolean
  showAvatar?: boolean
}

type ConversationApi = {
  getRequirementConversationByRequirement: typeof userConversationApi.getRequirementConversationByRequirement
  sendRequirementConversationMessage: typeof userConversationApi.sendRequirementConversationMessage
  subscribeRequirementConversationEvents: typeof userConversationApi.subscribeRequirementConversationEvents
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const emojiOptions = [
  '😀',
  '😄',
  '😊',
  '😉',
  '👍',
  '👌',
  '🙏',
  '🤝',
  '🎉',
  '✨',
  '🔥',
  '💡',
  '📌',
  '✅',
  '❗',
  '👀',
]

const conversationApi = computed<ConversationApi>(() =>
  props.apiMode === 'dev' ? devConversationApi : userConversationApi,
)
const conversation = computed(() => detail.value?.conversation ?? null)
const messages = computed(() => detail.value?.messages ?? [])
const conversationClosed = computed(
  () => conversation.value?.status === 'closed' || conversation.value?.requirement_status === 'completed',
)
const canSend = computed(
  () =>
    (draft.value.trim().length > 0 || Boolean(attachmentDraft.value)) &&
    !sending.value &&
    !loading.value &&
    !conversationClosed.value,
)
const isInline = computed(() => props.displayMode === 'inline')
const closeActionLabel = computed(() => (isInline.value ? '返回列表' : '关闭'))
const conversationTitle = computed(
  () => props.title || conversation.value?.requirement_title || '需求沟通',
)
const participantLabel = computed(() => {
  const item = conversation.value
  if (!item) {
    return ''
  }

  if (props.currentUsername === item.customer) {
    return `开发者：${item.developer}`
  }
  if (props.currentUsername === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
})
const peerName = computed(() => {
  const item = conversation.value
  if (!item) {
    return '会话'
  }

  if (props.currentUsername === item.customer) {
    return item.developer
  }
  if (props.currentUsername === item.developer) {
    return item.customer
  }
  return item.developer || item.customer || '会话'
})
const peerInitial = computed(() => avatarText(peerName.value))
const lastMessageLabel = computed(() => {
  const item = conversation.value
  if (!item?.last_message_at) {
    return '尚无消息'
  }
  return `最近 ${formatFullDateTime(item.last_message_at)}`
})
const realtimeStatusLabel = computed(() => {
  if (realtimeStatus.value === 'connected') {
    return '实时同步中'
  }
  if (realtimeStatus.value === 'error') {
    return '实时重连中'
  }
  if (realtimeStatus.value === 'connecting') {
    return '实时连接中'
  }
  return '实时待连接'
})
const timelineItems = computed<ConversationTimelineItem[]>(() => {
  const rows: ConversationTimelineItem[] = []
  let previousDateKey = ''

  const sourceMessages = messages.value

  for (const [index, message] of sourceMessages.entries()) {
    const dateKey = localDateKey(message.created_at)
    const nextMessage = sourceMessages[index + 1]
    const nextDateKey = nextMessage ? localDateKey(nextMessage.created_at) : ''

    if (dateKey && dateKey !== previousDateKey) {
      rows.push({
        key: `date-${dateKey}-${message.id}`,
        kind: 'date',
        label: formatDateLabel(message.created_at),
      })
      previousDateKey = dateKey
    }

    const mine = isMine(message)
    rows.push({
      key: `message-${message.id}`,
      kind: 'message',
      message,
      mine,
      showAvatar:
        !mine && (!nextMessage || nextMessage.sender !== message.sender || nextDateKey !== dateKey),
    })
  }

  return rows
})

watch(
  () => [props.visible, props.token, props.requirementId, props.apiMode] as const,
  ([visible]) => {
    stopRealtime()
    if (visible) {
      void loadConversation()
      startRealtime()
      return
    }
    resetComposer()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopRealtime()
  clearAttachmentDraft()
})

async function scrollToBottom() {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}

async function loadConversation() {
  if (!props.token || !props.requirementId) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await conversationApi.value.getRequirementConversationByRequirement(
      props.token,
      props.requirementId,
    )
    emit('updated', detail.value)
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载会话失败'
    detail.value = null
  } finally {
    loading.value = false
  }
}

function applyRealtimeDetail(payload: RequirementConversationDetail) {
  if (payload.conversation.requirement_id !== props.requirementId) {
    return
  }

  detail.value = payload
  emit('updated', payload)
  void scrollToBottom()
}

function startRealtime() {
  if (!props.token || !props.requirementId) {
    realtimeStatus.value = 'idle'
    return
  }

  realtimeStatus.value = 'connecting'
  realtimeError.value = ''
  stopRealtimeEvents = conversationApi.value.subscribeRequirementConversationEvents(props.token, {
    onUpdate: applyRealtimeDetail,
    onOpen: () => {
      realtimeStatus.value = 'connected'
      realtimeError.value = ''
    },
    onClose: () => {
      if (props.visible && props.token) {
        realtimeStatus.value = 'connecting'
      }
    },
    onError: (error) => {
      realtimeStatus.value = 'error'
      realtimeError.value = error.message
    },
  })
}

function stopRealtime() {
  if (stopRealtimeEvents) {
    stopRealtimeEvents()
    stopRealtimeEvents = null
  }
  realtimeStatus.value = 'idle'
  realtimeError.value = ''
}

async function submitMessage() {
  if (sending.value || loading.value || conversationClosed.value) {
    return
  }

  const content = draft.value.trim()
  const activeAttachment = attachmentDraft.value
  const activeConversation = conversation.value
  if ((!content && !activeAttachment) || !activeConversation || !props.token) {
    return
  }

  sending.value = true
  errorMessage.value = ''
  attachmentError.value = ''
  try {
    detail.value = await conversationApi.value.sendRequirementConversationMessage(
      props.token,
      activeConversation.conversation_id,
      content,
      activeAttachment?.file,
    )
    emit('updated', detail.value)
    if (draft.value.trim() === content) {
      draft.value = ''
    }
    if (activeAttachment && attachmentDraft.value?.previewUrl === activeAttachment.previewUrl) {
      clearAttachmentDraft()
    }
    emojiPanelOpen.value = false
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送消息失败'
  } finally {
    sending.value = false
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  void submitMessage()
}

function resetComposer() {
  draft.value = ''
  errorMessage.value = ''
  attachmentError.value = ''
  emojiPanelOpen.value = false
  clearAttachmentDraft()
}

function clearAttachmentDraft() {
  if (attachmentDraft.value) {
    URL.revokeObjectURL(attachmentDraft.value.previewUrl)
  }
  attachmentDraft.value = null
}

function toggleEmojiPanel() {
  if (sending.value || loading.value || conversationClosed.value) {
    return
  }
  emojiPanelOpen.value = !emojiPanelOpen.value
}

function insertEmoji(emoji: string) {
  const input = draftInputRef.value
  if (!input) {
    draft.value = `${draft.value}${emoji}`
    return
  }

  const selectionStart = input.selectionStart ?? draft.value.length
  const selectionEnd = input.selectionEnd ?? selectionStart
  draft.value = `${draft.value.slice(0, selectionStart)}${emoji}${draft.value.slice(selectionEnd)}`

  void nextTick(() => {
    input.focus()
    const cursorPosition = selectionStart + emoji.length
    input.setSelectionRange(cursorPosition, cursorPosition)
  })
}

function openAttachmentPicker() {
  if (sending.value || loading.value || conversationClosed.value) {
    return
  }
  attachmentInputRef.value?.click()
}

function handleAttachmentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    applyAttachmentFile(file)
  }
  input.value = ''
}

function handleComposerPaste(event: ClipboardEvent) {
  const file = findClipboardImage(event.clipboardData)
  if (!file) {
    return
  }

  event.preventDefault()
  applyAttachmentFile(file)
}

function findClipboardImage(data: DataTransfer | null) {
  if (!data) {
    return null
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) {
      return file
    }
  }

  return null
}

function applyAttachmentFile(file: File) {
  const mimeType = file.type || mimeTypeFromName(file.name)
  if (!mimeType.startsWith('image/')) {
    attachmentError.value = '仅支持图片附件'
    return
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    attachmentError.value = '图片不能超过 8MB'
    return
  }

  clearAttachmentDraft()
  const name = file.name?.trim() || defaultAttachmentName(mimeType)
  const uploadFile = file.name?.trim() ? file : new File([file], name, { type: mimeType })
  attachmentDraft.value = {
    file: uploadFile,
    previewUrl: URL.createObjectURL(uploadFile),
    name,
    mimeType,
    sizeLabel: formatBytes(uploadFile.size),
  }
  attachmentError.value = ''
}

function mimeTypeFromName(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lowerName.endsWith('.webp')) {
    return 'image/webp'
  }
  if (lowerName.endsWith('.gif')) {
    return 'image/gif'
  }
  if (lowerName.endsWith('.png')) {
    return 'image/png'
  }
  return ''
}

function defaultAttachmentName(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'screenshot.jpg'
  }
  if (mimeType === 'image/webp') {
    return 'screenshot.webp'
  }
  if (mimeType === 'image/gif') {
    return 'screenshot.gif'
  }
  return 'screenshot.png'
}

function messageAttachmentUrl(message: RequirementConversationMessage) {
  return message.attachment_url ? apiUrl(message.attachment_url) : ''
}

function messageAttachmentLabel(message: RequirementConversationMessage) {
  return message.attachment_name || '截图附件'
}

function isImageAttachment(message: RequirementConversationMessage) {
  const mimeType = message.attachment_mime ?? ''
  if (mimeType.startsWith('image/')) {
    return true
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(message.attachment_url ?? '')
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function isMine(message: RequirementConversationMessage) {
  return Boolean(props.currentUsername && message.sender === props.currentUsername)
}

function avatarText(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function parseDate(value?: string | null) {
  if (!value) {
    return null
  }
  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function localDateKey(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateLabel(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return '最近消息'
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const key = localDateKey(value)

  if (key === localDateKey(today.toISOString())) {
    return '今天'
  }
  if (key === localDateKey(yesterday.toISOString())) {
    return '昨天'
  }

  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === today.getFullYear()
      ? { month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' }
  return date.toLocaleDateString('zh-CN', options)
}

function formatMessageClock(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFullDateTime(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
    <div v-if="visible" class="conversation-modal-wrap" :class="{ 'conversation-modal-wrap--inline': isInline }"
      @click.self="handleBackdropClick">
      <section class="conversation-modal" aria-label="需求沟通会话">
        <header class="conversation-modal__header">
          <button class="conversation-modal__icon-btn conversation-modal__back" type="button"
            :aria-label="closeActionLabel" :title="closeActionLabel" @click="closeModal">
            <el-icon>
              <ArrowLeft />
            </el-icon>
          </button>

          <div class="conversation-modal__avatar" aria-hidden="true">{{ peerInitial }}</div>

          <div class="conversation-modal__identity">
            <h3>{{ conversationTitle }}</h3>
            <p>{{ conversation ? participantLabel : requirementId }}</p>
            <div class="conversation-modal__meta">
              <span class="conversation-modal__live" :class="`conversation-modal__live--${realtimeStatus}`"
                :title="realtimeError">
                {{ realtimeStatusLabel }}
              </span>
              <span>{{ lastMessageLabel }}</span>
            </div>
          </div>

          <div class="conversation-modal__header-actions">
            <button class="conversation-modal__icon-btn" type="button" :disabled="loading" aria-label="刷新会话"
              title="刷新会话" @click="loadConversation">
              <el-icon :class="{ 'conversation-modal__spin': loading }">
                <Refresh />
              </el-icon>
            </button>
          </div>
        </header>

        <div ref="messageListRef" class="conversation-modal__messages">
          <div v-if="loading" class="conversation-modal__empty">
            <el-icon>
              <ChatDotRound />
            </el-icon>
            <span>会话加载中...</span>
          </div>
          <div v-else-if="errorMessage" class="conversation-modal__empty conversation-modal__empty--error">
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadConversation">重试</button>
          </div>
          <div v-else-if="messages.length === 0" class="conversation-modal__empty">
            <el-icon>
              <ChatDotRound />
            </el-icon>
            <span>暂无消息</span>
          </div>
          <template v-else>
            <template v-for="row in timelineItems" :key="row.key">
              <div v-if="row.kind === 'date'" class="conversation-date-pill">{{ row.label }}</div>
              <article v-else-if="row.message" class="conversation-message"
                :class="{ 'conversation-message--mine': row.mine }">
                <div v-if="!row.mine" class="conversation-message__avatar-slot" aria-hidden="true">
                  <div v-if="row.showAvatar" class="conversation-message__avatar">
                    {{ avatarText(row.message.sender) }}
                  </div>
                </div>
                <div class="conversation-message__bubble">
                  <div v-if="row.message.attachment_url" class="conversation-message__attachment">
                    <a class="conversation-message__attachment-link" :href="messageAttachmentUrl(row.message)"
                      target="_blank" rel="noopener noreferrer" :title="messageAttachmentLabel(row.message)">
                      <img v-if="isImageAttachment(row.message)" :src="messageAttachmentUrl(row.message)"
                        :alt="messageAttachmentLabel(row.message)" />
                      <span v-else class="conversation-message__attachment-file">
                        <el-icon>
                          <Picture />
                        </el-icon>
                      </span>
                    </a>
                    <div class="conversation-message__attachment-meta">
                      <span>{{ messageAttachmentLabel(row.message) }}</span>
                      <small v-if="row.message.attachment_size">{{
                        formatBytes(row.message.attachment_size)
                        }}</small>
                    </div>
                  </div>
                  <p v-if="row.message.content">{{ row.message.content }}</p>
                  <time :title="row.message.created_at">{{
                    formatMessageClock(row.message.created_at)
                    }}</time>
                </div>
              </article>
            </template>
          </template>
        </div>

        <footer class="conversation-modal__composer">
          <p v-if="conversationClosed" class="conversation-modal__closed-tip">需求已完成，会话已停用</p>
          <div class="conversation-modal__composer-main">
            <div class="conversation-modal__tools">
              <button class="conversation-modal__tool-btn" :class="{ 'is-active': emojiPanelOpen }" type="button"
                :disabled="sending || loading || conversationClosed" aria-label="选择表情" title="选择表情" @click="toggleEmojiPanel">
                <el-icon>
                  <MagicStick />
                </el-icon>
              </button>
              <button class="conversation-modal__tool-btn" type="button" :disabled="sending || loading || conversationClosed"
                aria-label="添加截图附件" title="添加截图附件" @click="openAttachmentPicker">
                <el-icon>
                  <Paperclip />
                </el-icon>
              </button>
              <input ref="attachmentInputRef" class="conversation-modal__attachment-native" type="file"
                accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAttachmentFileChange" />
            </div>

            <Transition name="conversation-emoji">
              <div v-if="emojiPanelOpen" class="conversation-modal__emoji-panel">
                <button v-for="emoji in emojiOptions" :key="emoji" class="conversation-modal__emoji-btn" type="button"
                  :aria-label="`插入表情 ${emoji}`" @click="insertEmoji(emoji)">
                  {{ emoji }}
                </button>
              </div>
            </Transition>

            <div v-if="attachmentDraft" class="conversation-modal__attachment-preview">
              <img :src="attachmentDraft.previewUrl" alt="截图预览" />
              <div>
                <strong>{{ attachmentDraft.name }}</strong>
                <span>{{ attachmentDraft.sizeLabel }}</span>
              </div>
              <button class="conversation-modal__attachment-remove" type="button" aria-label="移除附件" title="移除附件"
                @click="clearAttachmentDraft">
                <el-icon>
                  <Close />
                </el-icon>
              </button>
            </div>

            <p v-if="attachmentError" class="conversation-modal__attachment-error">
              {{ attachmentError }}
            </p>

            <div class="conversation-modal__input-shell">
              <textarea ref="draftInputRef" v-model="draft" maxlength="5000" placeholder="输入消息" spellcheck="false"
                autocomplete="new-password" autocorrect="off" autocapitalize="off" aria-autocomplete="none"
                data-ms-editor="false" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                data-lt-active="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true"
                :disabled="conversationClosed"
                @keydown="handleComposerKeydown" @paste="handleComposerPaste"></textarea>
              <span>{{ draft.trim().length }} / 5000</span>
            </div>
          </div>
          <button class="conversation-modal__send-btn" type="button" :disabled="!canSend" aria-label="发送消息" title="发送消息"
            @click="submitMessage">
            <el-icon>
              <Position />
            </el-icon>
          </button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.conversation-modal-wrap {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.42);
}

.conversation-modal-wrap--inline {
  position: static;
  inset: auto;
  z-index: auto;
  display: block;
  padding: 0;
  background: transparent;
}

.conversation-modal {
  width: min(720px, 100%);
  max-height: min(760px, calc(100dvh - 36px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.conversation-modal-wrap--inline .conversation-modal {
  width: 100%;
  height: min(680px, calc(100dvh - 190px));
  min-height: min(520px, calc(100dvh - 190px));
  max-height: calc(100dvh - 190px);
  border-radius: 16px;
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.conversation-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.conversation-modal-wrap--inline .conversation-modal__header {
  align-items: center;
  padding: 14px 16px 12px;
}

.conversation-modal__header h3 {
  margin: 0;
  color: #0f172a;
  font-size: 20px;
}

.conversation-modal-wrap--inline .conversation-modal__header h3 {
  font-size: 18px;
}

.conversation-modal__header p {
  margin: 6px 0 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.5;
}

.conversation-modal-wrap--inline .conversation-modal__header p {
  margin-top: 4px;
}

.conversation-modal__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  color: #475569;
  font-size: 12px;
}

.conversation-modal__meta span {
  padding: 3px 8px;
  border-radius: 999px;
  background: #f1f5f9;
}

.conversation-modal__meta .conversation-modal__live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.conversation-modal__live::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #94a3b8;
}

.conversation-modal__live--connected::before {
  background: #16a34a;
}

.conversation-modal__live--connecting::before {
  background: #2563eb;
}

.conversation-modal__live--error::before {
  background: #d97706;
}

.conversation-modal__header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.conversation-modal__close,
.conversation-modal__composer button {
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
}

.conversation-modal__close {
  flex: 0 0 auto;
  padding: 7px 12px;
}

.conversation-modal__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 20px;
  background: #f8fafc;
}

.conversation-modal-wrap--inline .conversation-modal__messages {
  min-height: 0;
  padding: 14px 16px;
}

.conversation-modal__empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  color: #64748b;
}

.conversation-modal__empty--error {
  color: #b42318;
  gap: 12px;
}

.conversation-modal__empty--error button {
  border: 1px solid rgba(180, 35, 24, 0.24);
  border-radius: 10px;
  background: #fff7f5;
  color: #b42318;
  padding: 7px 12px;
  cursor: pointer;
}

.conversation-message {
  width: min(78%, 520px);
  margin-bottom: 14px;
}

.conversation-message--mine {
  margin-left: auto;
}

.conversation-message__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 12px;
}

.conversation-message p {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px 14px 14px 4px;
  background: #ffffff;
  color: #0f172a;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine p {
  border-color: rgba(46, 116, 255, 0.18);
  border-radius: 14px 14px 4px 14px;
  background: #eaf2ff;
}

.conversation-modal__composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
}

.conversation-modal__closed-tip {
  grid-column: 1 / -1;
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.conversation-modal-wrap--inline .conversation-modal__composer {
  padding: 12px 14px;
}

.conversation-modal__send-box {
  align-self: end;
  display: grid;
  gap: 8px;
  justify-items: end;
}

.conversation-modal__send-box span {
  color: #64748b;
  font-size: 12px;
}

.conversation-modal__composer textarea {
  min-height: 72px;
  resize: vertical;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 12px;
  padding: 10px 12px;
  color: #0f172a;
  font: inherit;
  line-height: 1.6;
}

.conversation-modal-wrap--inline .conversation-modal__composer textarea {
  min-height: 60px;
}

.conversation-modal__composer button {
  align-self: end;
  min-width: 84px;
  height: 40px;
  padding: 0 16px;
  background: #1f6feb;
  color: #ffffff;
  border-color: #1f6feb;
}

.conversation-modal__composer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .conversation-modal-wrap {
    padding: 10px;
  }

  .conversation-modal-wrap--inline {
    padding: 0;
  }

  .conversation-modal {
    max-height: calc(100dvh - 20px);
    border-radius: 14px;
  }

  .conversation-modal-wrap--inline .conversation-modal {
    height: calc(100dvh - 118px);
    min-height: min(440px, calc(100dvh - 118px));
    max-height: calc(100dvh - 118px);
  }

  .conversation-message {
    width: 100%;
  }

  .conversation-modal__composer {
    grid-template-columns: 1fr;
  }

  .conversation-modal__header {
    flex-direction: column;
  }

  .conversation-modal__header-actions {
    width: 100%;
  }

  .conversation-modal__header-actions button {
    flex: 1;
  }

  .conversation-modal__send-box {
    width: 100%;
    justify-items: stretch;
  }

  .conversation-modal__composer button {
    width: 100%;
  }
}

.conversation-modal {
  width: min(760px, 100%);
  border-color: rgba(213, 226, 244, 0.98);
  background: #f7fbff;
}

.conversation-modal-wrap--inline .conversation-modal {
  height: min(720px, calc(100dvh - 170px));
  min-height: min(520px, calc(100dvh - 170px));
  max-height: calc(100dvh - 170px);
  box-shadow: 0 10px 28px rgba(76, 103, 172, 0.08);
}

.conversation-modal__header {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom-color: rgba(213, 226, 244, 0.92);
  background: rgba(255, 255, 255, 0.94);
}

.conversation-modal-wrap--inline .conversation-modal__header {
  display: grid;
  align-items: center;
  padding: 10px 12px;
}

.conversation-modal__identity {
  min-width: 0;
}

.conversation-modal__identity h3,
.conversation-modal__identity p {
  margin: 0;
}

.conversation-modal__identity h3 {
  overflow: hidden;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__identity p {
  overflow: hidden;
  margin-top: 2px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__avatar,
.conversation-message__avatar {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f8cff, #5ec8a8);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
}

.conversation-modal__avatar {
  width: 42px;
  height: 42px;
  font-size: 17px;
}

.conversation-message__avatar {
  width: 30px;
  height: 30px;
  margin-bottom: 2px;
  font-size: 12px;
}

.conversation-modal__meta {
  gap: 6px;
  margin-top: 5px;
  color: #64748b;
  font-size: 11px;
}

.conversation-modal__meta span {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 999px;
  background: #f1f6ff;
}

.conversation-modal__icon-btn,
.conversation-modal__send-btn {
  display: inline-grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  transition:
    background 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.conversation-modal__icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font-size: 18px;
}

.conversation-modal__icon-btn:hover:not(:disabled) {
  background: #eef6ff;
  color: #1d4ed8;
}

.conversation-modal__icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.conversation-modal__spin {
  animation: conversation-spin 900ms linear infinite;
}

.conversation-modal__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 18px 20px;
  background: linear-gradient(135deg,
      rgba(225, 241, 255, 0.78),
      rgba(248, 252, 255, 0.9) 44%,
      rgba(235, 250, 244, 0.78));
  scrollbar-color: rgba(79, 140, 255, 0.58) transparent;
  scrollbar-width: thin;
}

.conversation-modal-wrap--inline .conversation-modal__messages {
  padding: 18px 18px 20px;
}

.conversation-modal__messages::-webkit-scrollbar {
  width: 8px;
}

.conversation-modal__messages::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__messages::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-modal__messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(79, 140, 255, 0.5);
}

.conversation-modal__empty {
  align-content: center;
  gap: 10px;
  min-height: 220px;
  text-align: center;
}

.conversation-modal__empty .el-icon {
  color: #4f8cff;
  font-size: 30px;
}

.conversation-date-pill {
  width: max-content;
  max-width: 100%;
  margin: 4px auto 14px;
  padding: 4px 10px;
  border: 1px solid rgba(203, 213, 225, 0.74);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(76, 103, 172, 0.06);
}

.conversation-message {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  margin: 0 0 10px;
}

.conversation-message--mine {
  justify-content: flex-end;
}

.conversation-message__bubble {
  position: relative;
  max-width: min(70%, 620px);
  min-width: 58px;
  padding: 8px 10px 6px;
  border: 1px solid rgba(221, 231, 246, 0.92);
  border-radius: 16px 16px 16px 5px;
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  box-shadow: 0 8px 18px rgba(76, 103, 172, 0.08);
}

.conversation-message--mine .conversation-message__bubble {
  border-color: rgba(96, 165, 250, 0.28);
  border-radius: 16px 16px 5px 16px;
  background: #ddecff;
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.08);
}

.conversation-message__sender {
  margin-bottom: 4px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.35;
}

.conversation-message__bubble p {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine .conversation-message__bubble p {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.conversation-message__bubble time {
  display: block;
  margin-top: 2px;
  color: #64748b;
  font-size: 10px;
  line-height: 1.2;
  text-align: right;
}

.conversation-modal__composer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 10px 12px 12px;
  border-top-color: rgba(213, 226, 244, 0.92);
  background: rgba(255, 255, 255, 0.96);
}

.conversation-modal__input-shell {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.conversation-modal__input-shell textarea {
  width: 100%;
  min-height: 38px;
  max-height: 120px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 6px 0;
  color: #0f172a;
  background: transparent;
  font: inherit;
  line-height: 1.55;
}

.conversation-modal__input-shell span {
  color: #94a3b8;
  font-size: 11px;
  white-space: nowrap;
}

.conversation-modal__send-btn {
  width: 46px;
  height: 46px;
  min-width: 0;
  padding: 0;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font-size: 20px;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
}

.conversation-modal__send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #1d4ed8;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.26);
}

.conversation-modal__send-btn:disabled {
  cursor: not-allowed;
  background: #cbd5e1;
  box-shadow: none;
  opacity: 0.8;
}

@keyframes conversation-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .conversation-modal-wrap--inline .conversation-modal {
    height: calc(100dvh - 118px);
    min-height: min(440px, calc(100dvh - 118px));
    max-height: calc(100dvh - 118px);
  }

  .conversation-modal__header {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    padding: 8px 10px;
  }

  .conversation-modal__avatar {
    width: 38px;
    height: 38px;
  }

  .conversation-modal__identity h3 {
    font-size: 15px;
  }

  .conversation-modal__meta span:last-child {
    display: none;
  }

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 14px 10px 16px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }

  .conversation-modal__composer {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 9px 10px 10px;
  }

  .conversation-modal__input-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    border-radius: 16px;
  }

  .conversation-modal__input-shell span {
    justify-self: end;
  }

  .conversation-modal__send-btn {
    width: 44px;
    height: 44px;
  }
}

.conversation-modal__header {
  min-height: 68px;
}

.conversation-modal__messages {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.conversation-date-pill,
.conversation-message {
  max-width: 880px;
}

.conversation-message {
  margin-right: auto;
  margin-left: auto;
}

.conversation-message__bubble {
  max-width: min(68%, 560px);
}

.conversation-message--mine .conversation-message__bubble {
  background: #dcecff;
}

.conversation-modal__composer {
  margin-top: 0;
  align-items: center;
}

.conversation-modal__input-shell {
  min-height: 52px;
}

.conversation-modal-wrap--inline .conversation-modal__input-shell textarea {
  min-height: 38px;
}

@media (max-width: 820px) {
  .conversation-message__bubble {
    max-width: min(76%, 560px);
  }
}

@media (max-width: 640px) {
  .conversation-modal__header {
    min-height: 62px;
  }

  .conversation-message {
    max-width: 100%;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }
}

.conversation-modal__messages {
  background-color: #d8efcf;
  background-image:
    radial-gradient(circle at 16px 18px, rgba(73, 132, 85, 0.12) 0 1px, transparent 2px),
    radial-gradient(circle at 78px 42px, rgba(73, 132, 85, 0.1) 0 1px, transparent 2px),
    linear-gradient(135deg, rgba(201, 229, 195, 0.9), rgba(224, 242, 216, 0.88));
  background-size:
    92px 72px,
    120px 96px,
    auto;
  padding: 12px 14px 16px;
}

.conversation-date-pill {
  margin-bottom: 10px;
  padding: 3px 10px;
  border: 0;
  background: rgba(255, 255, 255, 0.72);
  color: #5d765c;
  box-shadow: 0 4px 10px rgba(87, 125, 93, 0.12);
}

.conversation-message {
  max-width: 100%;
  min-height: 0;
  align-items: flex-end;
  gap: 6px;
  margin: 0 0 4px;
}

.conversation-message__avatar-slot {
  width: 28px;
  display: inline-flex;
  flex: 0 0 28px;
  justify-content: center;
}

.conversation-message__avatar {
  width: 24px;
  height: 24px;
  margin-bottom: 1px;
  background: linear-gradient(135deg, #f1a33c, #f9c25c);
  font-size: 11px;
  box-shadow: 0 4px 10px rgba(136, 88, 27, 0.16);
}

.conversation-message__bubble {
  display: grid;
  grid-template-columns: minmax(0, auto) auto;
  align-items: end;
  column-gap: 10px;
  row-gap: 2px;
  width: fit-content;
  max-width: min(68%, 620px);
  min-width: 0;
  padding: 5px 8px 4px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 1px rgba(54, 86, 58, 0.16);
}

.conversation-message--mine .conversation-message__bubble {
  background: #d9fdd3;
  box-shadow: 0 1px 1px rgba(54, 86, 58, 0.14);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  grid-column: 1;
  min-width: 0;
  color: #111827;
  font-size: 13px;
  line-height: 1.38;
}

.conversation-message__bubble time {
  grid-column: 2;
  margin: 0;
  color: #688168;
  font-size: 10px;
  line-height: 1.15;
  white-space: nowrap;
}

.conversation-message__sender {
  display: none;
}

@media (max-width: 820px) {
  .conversation-message__bubble {
    max-width: min(78%, 620px);
  }
}

@media (max-width: 640px) {

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 10px 8px 14px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 40px);
  }
}

.conversation-modal__composer {
  grid-template-columns: minmax(0, 1fr) 48px;
  align-items: end;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid rgba(167, 190, 166, 0.36);
  background: #f7f8f4;
}

.conversation-modal__composer-main {
  position: relative;
  min-width: 0;
  display: grid;
  gap: 6px;
}

.conversation-modal__tools {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 2px;
}

.conversation-modal__composer .conversation-modal__tool-btn,
.conversation-modal__composer .conversation-modal__emoji-btn,
.conversation-modal__composer .conversation-modal__attachment-remove {
  display: inline-grid;
  place-items: center;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(185, 204, 190, 0.72);
  background: rgba(255, 255, 255, 0.92);
  color: #3f5f49;
  box-shadow: none;
}

.conversation-modal__composer .conversation-modal__tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  font-size: 17px;
}

.conversation-modal__composer .conversation-modal__tool-btn:hover:not(:disabled),
.conversation-modal__composer .conversation-modal__tool-btn.is-active {
  border-color: rgba(45, 118, 236, 0.34);
  background: #eef6ff;
  color: #1d4ed8;
  transform: translateY(-1px);
}

.conversation-modal__composer .conversation-modal__tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.conversation-modal__attachment-native {
  display: none;
}

.conversation-modal__emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 32px);
  gap: 6px;
  width: max-content;
  max-width: 100%;
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(54, 86, 58, 0.12);
}

.conversation-modal__composer .conversation-modal__emoji-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 18px;
  line-height: 1;
}

.conversation-modal__composer .conversation-modal__emoji-btn:hover {
  border-color: rgba(45, 118, 236, 0.26);
  background: #f1f7ff;
  transform: translateY(-1px);
}

.conversation-emoji-enter-active,
.conversation-emoji-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.conversation-emoji-enter-from,
.conversation-emoji-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.conversation-modal__attachment-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 16px rgba(54, 86, 58, 0.08);
}

.conversation-modal__attachment-preview img {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: #eef3eb;
}

.conversation-modal__attachment-preview div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.conversation-modal__attachment-preview strong,
.conversation-modal__attachment-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__attachment-preview strong {
  color: #172033;
  font-size: 13px;
  line-height: 1.25;
}

.conversation-modal__attachment-preview span {
  color: #6b7f6d;
  font-size: 12px;
}

.conversation-modal__composer .conversation-modal__attachment-remove {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #64748b;
}

.conversation-modal__composer .conversation-modal__attachment-remove:hover {
  border-color: rgba(190, 18, 60, 0.2);
  background: #fff1f2;
  color: #be123c;
}

.conversation-modal__attachment-error {
  margin: 0;
  padding-left: 4px;
  color: #b42318;
  font-size: 12px;
  line-height: 1.35;
}

.conversation-message__attachment {
  grid-column: 1 / -1;
  display: grid;
  gap: 5px;
  width: min(260px, 64vw);
  max-width: 100%;
}

.conversation-message__attachment-link {
  display: block;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  color: inherit;
}

.conversation-message__attachment-link img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  background: rgba(15, 23, 42, 0.04);
}

.conversation-message__attachment-file {
  display: grid;
  place-items: center;
  height: 120px;
  color: #2d76ec;
  font-size: 28px;
}

.conversation-message__attachment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: #536b55;
  font-size: 11px;
  line-height: 1.25;
}

.conversation-message__attachment-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-message__attachment-meta small {
  flex: 0 0 auto;
  color: #78907a;
  font-size: 10px;
}

.conversation-message__attachment+p {
  grid-column: 1 / -1;
  margin-top: 2px;
}

.conversation-modal__composer .conversation-modal__input-shell {
  position: relative;
  display: flex;
  min-height: 48px;
  height: 48px;
  align-items: center;
  padding: 0 12px 0 18px;
  border-color: rgba(148, 163, 184, 0.5);
  border-radius: 999px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.conversation-modal__composer .conversation-modal__input-shell:focus-within {
  border-color: rgba(47, 125, 246, 0.62);
  box-shadow:
    0 0 0 3px rgba(47, 125, 246, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.conversation-modal__composer .conversation-modal__input-shell textarea {
  appearance: none;
  -webkit-appearance: none;
  height: 24px;
  min-height: 24px;
  max-height: 72px;
  padding: 0;
  resize: none;
  color: #111827;
  font-size: 15px;
  line-height: 24px;
  overflow: hidden;
  scrollbar-width: none;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar-button,
.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-resizer {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell input {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  height: 24px;
  border: 0;
  outline: 0;
  padding: 0 82px 0 0;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 24px;
}

.conversation-modal__composer .conversation-modal__input-shell input::placeholder {
  color: #8a95a5;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::placeholder {
  color: #8a95a5;
}

.conversation-modal__composer .conversation-modal__input-shell span {
  position: absolute;
  top: 50%;
  right: 16px;
  z-index: 2;
  transform: translateY(-50%);
  padding-left: 8px;
  background: #ffffff;
  color: #8fa0b4;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}

.conversation-modal__composer .conversation-modal__send-btn {
  align-self: center;
  width: 48px;
  min-width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #2d76ec;
  color: #ffffff;
  font-size: 22px;
  box-shadow: 0 8px 18px rgba(45, 118, 236, 0.24);
}

.conversation-modal__composer .conversation-modal__send-btn:hover:not(:disabled) {
  background: #2567d8;
  box-shadow: 0 10px 22px rgba(45, 118, 236, 0.28);
}

.conversation-modal__composer .conversation-modal__send-btn:disabled {
  background: #d5dce6;
  color: #ffffff;
  box-shadow: none;
}

@media (max-width: 640px) {
  .conversation-modal__composer {
    grid-template-columns: minmax(0, 1fr) 44px;
    padding: 8px 10px;
  }

  .conversation-modal__tools {
    gap: 5px;
  }

  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 32px;
    height: 32px;
  }

  .conversation-modal__emoji-panel {
    grid-template-columns: repeat(6, 32px);
  }

  .conversation-modal__attachment-preview {
    width: 100%;
  }

  .conversation-modal__composer .conversation-modal__input-shell {
    min-height: 44px;
    height: 44px;
    padding-right: 10px;
    padding-left: 14px;
  }

  .conversation-modal__composer .conversation-modal__input-shell textarea {
    height: 22px;
    min-height: 22px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell input {
    height: 22px;
    padding-right: 70px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell span {
    font-size: 11px;
  }

  .conversation-modal__composer .conversation-modal__send-btn {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }
}

.conversation-modal {
  border-color: rgba(216, 228, 244, 0.98);
  background: #f8fbff;
}

.conversation-modal-wrap--inline .conversation-modal {
  box-shadow: 0 16px 38px rgba(71, 102, 148, 0.1);
}

.conversation-modal__header {
  border-bottom-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.96);
}

.conversation-modal__avatar,
.conversation-message__avatar {
  background: linear-gradient(135deg, #4f8cff, #5ec8a8);
  box-shadow: 0 8px 18px rgba(79, 140, 255, 0.18);
}

.conversation-modal__meta span {
  background: #eef6ff;
  color: #52657f;
}

.conversation-modal__messages {
  background-color: #f3f7fc;
  background-image:
    radial-gradient(circle at 18px 18px, rgba(79, 140, 255, 0.08) 0 1px, transparent 2px),
    radial-gradient(circle at 88px 52px, rgba(94, 200, 168, 0.07) 0 1px, transparent 2px),
    linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(237, 245, 252, 0.96));
  background-size:
    96px 76px,
    128px 104px,
    auto;
  padding: 16px 18px 18px;
  scrollbar-color: rgba(79, 140, 255, 0.42) transparent;
}

.conversation-date-pill {
  margin: 2px auto 12px;
  padding: 4px 11px;
  border: 1px solid rgba(209, 222, 239, 0.86);
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  box-shadow: 0 8px 18px rgba(71, 102, 148, 0.08);
}

.conversation-message {
  gap: 8px;
  margin-bottom: 8px;
}

.conversation-message__avatar-slot {
  width: 30px;
  flex-basis: 30px;
}

.conversation-message__avatar {
  width: 26px;
  height: 26px;
  font-size: 11px;
}

.conversation-message__bubble {
  max-width: min(72%, 620px);
  padding: 8px 10px 6px;
  border: 1px solid rgba(218, 229, 244, 0.92);
  border-radius: 15px 15px 15px 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 20px rgba(71, 102, 148, 0.08);
}

.conversation-message--mine .conversation-message__bubble {
  border-color: rgba(172, 202, 255, 0.84);
  border-radius: 15px 15px 6px 15px;
  background: #e8f1ff;
  box-shadow: 0 8px 20px rgba(45, 118, 236, 0.1);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  color: #182335;
  font-size: 14px;
  line-height: 1.48;
}

.conversation-message__bubble time {
  color: #7d8da3;
}

.conversation-modal__composer {
  align-items: end;
  border-top-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -10px 24px rgba(71, 102, 148, 0.06);
}

.conversation-modal__composer-main {
  gap: 8px;
}

.conversation-modal__tools {
  gap: 7px;
  padding-left: 4px;
}

.conversation-modal__composer .conversation-modal__tool-btn,
.conversation-modal__composer .conversation-modal__emoji-btn,
.conversation-modal__composer .conversation-modal__attachment-remove {
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  color: #52657f;
}

.conversation-modal__composer .conversation-modal__tool-btn {
  width: 36px;
  height: 36px;
  box-shadow: 0 8px 18px rgba(71, 102, 148, 0.08);
}

.conversation-modal__composer .conversation-modal__tool-btn:hover:not(:disabled),
.conversation-modal__composer .conversation-modal__tool-btn.is-active {
  border-color: rgba(79, 140, 255, 0.44);
  background: #eef6ff;
  color: #2563eb;
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.14);
}

.conversation-modal__emoji-panel {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 4;
  border-color: rgba(207, 220, 238, 0.96);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(71, 102, 148, 0.18);
}

.conversation-modal__composer .conversation-modal__emoji-btn:hover {
  border-color: rgba(79, 140, 255, 0.34);
  background: #eef6ff;
}

.conversation-modal__attachment-preview {
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(71, 102, 148, 0.1);
}

.conversation-modal__attachment-preview img {
  background: #f1f6fb;
}

.conversation-modal__attachment-preview span,
.conversation-message__attachment-meta,
.conversation-message__attachment-meta small {
  color: #64748b;
}

.conversation-message__attachment-link {
  border: 1px solid rgba(216, 228, 244, 0.88);
  background: #f8fbff;
}

.conversation-message__attachment-link img {
  background: #f8fbff;
}

.conversation-modal__composer .conversation-modal__input-shell {
  min-height: 50px;
  height: 50px;
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  box-shadow:
    0 8px 22px rgba(71, 102, 148, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
}

.conversation-modal__composer .conversation-modal__input-shell:focus-within {
  border-color: rgba(79, 140, 255, 0.7);
  box-shadow:
    0 0 0 3px rgba(79, 140, 255, 0.13),
    0 10px 24px rgba(71, 102, 148, 0.1);
}

.conversation-modal__composer .conversation-modal__input-shell textarea {
  color: #182335;
}

.conversation-modal__composer .conversation-modal__input-shell span {
  color: #9aa8ba;
}

.conversation-modal__composer .conversation-modal__send-btn {
  background: #2d76ec;
  box-shadow: 0 12px 24px rgba(45, 118, 236, 0.24);
}

.conversation-modal__composer .conversation-modal__send-btn:hover:not(:disabled) {
  background: #2467d8;
  box-shadow: 0 14px 28px rgba(45, 118, 236, 0.28);
}

@media (max-width: 820px) {
  .conversation-message__bubble {
    max-width: min(78%, 620px);
  }
}

@media (max-width: 640px) {

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 12px 10px 14px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }

  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 34px;
    height: 34px;
  }

  .conversation-modal__emoji-panel {
    left: 0;
    max-width: calc(100vw - 36px);
  }
}

.conversation-message {
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.conversation-date-pill {
  flex: 0 0 auto;
}

.conversation-message:last-child {
  margin-bottom: 0;
}

.conversation-message__bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 104px;
  padding: 10px 12px 7px;
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  width: 100%;
  font-size: 15px;
  line-height: 1.5;
}

.conversation-message__bubble time {
  align-self: flex-end;
  margin-top: 0;
  font-size: 11px;
  line-height: 1;
}

.conversation-message__attachment {
  width: min(280px, 64vw);
}

@media (max-width: 640px) {
  .conversation-message {
    margin-bottom: 8px;
  }

  .conversation-message__bubble {
    min-width: 98px;
    padding: 9px 11px 7px;
  }

  .conversation-message__bubble p,
  .conversation-message--mine .conversation-message__bubble p {
    font-size: 14px;
  }
}
</style>
