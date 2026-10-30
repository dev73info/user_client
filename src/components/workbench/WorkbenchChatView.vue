<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, TIcon } from 'ui_73info'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import WorkbenchChatInbox from '@/components/workbench/WorkbenchChatInbox.vue'
import { useMessagesPage } from '@/composables/useMessagesPage'
import type { MessageThread } from '@/shared/messagesThreads'

const router = useRouter()
const keyword = ref('')
const isMobile = ref(false)
const chatRef = ref<HTMLElement | null>(null)
const inboxWidth = ref<number | null>(null)
const resizing = ref(false)
let mediaQuery: MediaQueryList | null = null

const INBOX_WIDTH_MIN = 280
const INBOX_WIDTH_MAX = 520
const INBOX_WIDTH_DEFAULT = 360
const CHAT_PANE_MIN_WIDTH = 360
const SPLITTER_WIDTH = 12
const INBOX_WIDTH_STORAGE_KEY = '73info:workbench:chat-inbox-width'

const {
  isDevWorkbench,
  loading,
  allThreads,
  activeRequirementId,
  token,
  username,
  openThread,
  closeConversation,
  applyConversationDetail,
} = useMessagesPage()

const visibleThreads = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  if (!normalized) {
    return allThreads.value
  }

  return allThreads.value.filter((thread) =>
    [
      thread.title,
      thread.requirementId,
      thread.partnerLabel,
      thread.description,
      thread.statusLabel,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  )
})

const selectedThread = computed<MessageThread | null>(() => {
  const active =
    allThreads.value.find((thread) => thread.requirementId === activeRequirementId.value) ?? null
  if (active) {
    return active
  }
  return isMobile.value ? null : (visibleThreads.value[0] ?? null)
})

const selectedRequirementId = computed(() => selectedThread.value?.requirementId ?? '')
const unreadCount = computed(() =>
  allThreads.value.reduce((total, thread) => total + thread.unreadCount, 0),
)
const isConversationOpen = computed(() => selectedRequirementId.value !== '')
const workbenchChatStyle = computed<Record<string, string> | undefined>(() =>
  inboxWidth.value === null
    ? undefined
    : { '--workbench-chat-inbox-width': `${inboxWidth.value}px` },
)

function syncMobile(event?: MediaQueryListEvent) {
  isMobile.value = event?.matches ?? mediaQuery?.matches ?? false
  if (isMobile.value) {
    finishResizeStyles()
  }
}

onMounted(() => {
  restoreInboxWidth()
  if (typeof window.matchMedia !== 'function') {
    return
  }
  mediaQuery = window.matchMedia('(max-width: 900px)')
  syncMobile()
  mediaQuery.addEventListener('change', syncMobile)
  window.addEventListener('resize', clampStoredInboxWidth)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncMobile)
  window.removeEventListener('resize', clampStoredInboxWidth)
  finishResizeStyles()
})

function selectThread(thread: MessageThread) {
  openThread(thread)
}

function composeConversation() {
  void router.push(
    isDevWorkbench.value ? { name: 'dev-requirement-hall' } : { name: 'workbench-requirements' },
  )
}

function maxInboxWidth() {
  const containerWidth = chatRef.value?.getBoundingClientRect().width ?? 0
  if (containerWidth <= 0) {
    return INBOX_WIDTH_MAX
  }
  return Math.max(
    INBOX_WIDTH_MIN,
    Math.min(INBOX_WIDTH_MAX, containerWidth - CHAT_PANE_MIN_WIDTH - SPLITTER_WIDTH),
  )
}

function normalizeInboxWidth(width: number) {
  return Math.round(Math.min(maxInboxWidth(), Math.max(INBOX_WIDTH_MIN, width)))
}

function currentInboxWidth() {
  if (inboxWidth.value !== null) {
    return inboxWidth.value
  }
  const measured = chatRef.value
    ?.querySelector<HTMLElement>('.workbench-inbox')
    ?.getBoundingClientRect().width
  return measured && measured > 0 ? measured : INBOX_WIDTH_DEFAULT
}

function setInboxWidth(width: number) {
  inboxWidth.value = normalizeInboxWidth(width)
}

function restoreInboxWidth() {
  try {
    const stored = Number(window.localStorage.getItem(INBOX_WIDTH_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) {
      inboxWidth.value = normalizeInboxWidth(stored)
    }
  } catch {
    // localStorage 被禁用时使用默认宽度。
  }
}

function persistInboxWidth() {
  if (inboxWidth.value === null) {
    return
  }
  try {
    window.localStorage.setItem(INBOX_WIDTH_STORAGE_KEY, String(inboxWidth.value))
  } catch {
    // 宽度只是界面偏好，存储失败不影响本次拖拽。
  }
}

function clampStoredInboxWidth() {
  if (inboxWidth.value !== null) {
    inboxWidth.value = normalizeInboxWidth(inboxWidth.value)
  }
}

function finishResizeStyles() {
  resizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function startResize(event: PointerEvent) {
  if (isMobile.value) {
    return
  }
  inboxWidth.value = normalizeInboxWidth(currentInboxWidth())
  resizing.value = true
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

function resizeInbox(event: PointerEvent) {
  if (!resizing.value) {
    return
  }
  const left = chatRef.value?.getBoundingClientRect().left ?? 0
  setInboxWidth(event.clientX - left)
}

function stopResize(event: PointerEvent) {
  if (!resizing.value) {
    return
  }
  persistInboxWidth()
  const splitter = event.currentTarget as HTMLElement | null
  if (splitter?.hasPointerCapture?.(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId)
  }
  finishResizeStyles()
}

function resetInboxWidth() {
  inboxWidth.value = normalizeInboxWidth(INBOX_WIDTH_DEFAULT)
  persistInboxWidth()
}

function resizeInboxByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 16
  let nextWidth = currentInboxWidth()

  if (event.key === 'ArrowLeft') {
    nextWidth -= step
  } else if (event.key === 'ArrowRight') {
    nextWidth += step
  } else if (event.key === 'Home') {
    nextWidth = INBOX_WIDTH_MIN
  } else if (event.key === 'End') {
    nextWidth = INBOX_WIDTH_MAX
  } else {
    return
  }

  event.preventDefault()
  setInboxWidth(nextWidth)
  persistInboxWidth()
}
</script>

<template>
  <section
    ref="chatRef"
    class="workbench-chat"
    :class="{
      'workbench-chat--conversation-open': isConversationOpen,
      'workbench-chat--resizing': resizing,
    }"
    :style="workbenchChatStyle"
    aria-label="消息工作台"
    data-testid="workbench-chat"
  >
    <div class="workbench-chat__inbox-shell">
      <WorkbenchChatInbox
        v-model:keyword="keyword"
        :threads="visibleThreads"
        :selected-requirement-id="selectedRequirementId"
        :loading="loading"
        :unread-count="unreadCount"
        @select="selectThread"
        @compose="composeConversation"
      />
    </div>

    <div
      class="workbench-chat__resizer"
      role="separator"
      aria-label="调整会话列表宽度"
      aria-orientation="vertical"
      :aria-valuemin="INBOX_WIDTH_MIN"
      :aria-valuemax="INBOX_WIDTH_MAX"
      :aria-valuenow="Math.round(inboxWidth ?? INBOX_WIDTH_DEFAULT)"
      tabindex="0"
      @dblclick="resetInboxWidth"
      @keydown="resizeInboxByKeyboard"
      @pointerdown.prevent="startResize"
      @pointermove.prevent="resizeInbox"
      @pointerup="stopResize"
      @pointercancel="stopResize"
    />

    <section class="workbench-chat__pane">
      <RequirementConversationModal
        v-if="selectedThread"
        display-mode="inline"
        :visible="true"
        :token="token"
        :api-mode="isDevWorkbench ? 'dev' : 'user'"
        :current-username="username"
        :requirement-id="selectedThread.requirementId"
        :title="selectedThread.title"
        @updated="applyConversationDetail"
        @close="closeConversation"
      />

      <div v-else class="workbench-chat__empty">
        <span class="workbench-chat__empty-icon">
          <TIcon :size="34">
            <ChatDotRound />
          </TIcon>
        </span>
        <strong>{{ loading ? '会话加载中...' : '选择一个会话' }}</strong>
      </div>
    </section>
  </section>
</template>

<style scoped src="./workbench-chat.css"></style>
