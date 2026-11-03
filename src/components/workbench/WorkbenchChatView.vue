<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ChatDotRound, TIcon } from 'ui_73info'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import WorkbenchChatInbox from '@/components/workbench/WorkbenchChatInbox.vue'
import WorkbenchPaneResizer from '@/components/workbench/WorkbenchPaneResizer.vue'
import { useMessagesPage } from '@/composables/useMessagesPage'
import {
  WORKBENCH_PANE_WIDTH_CSS_VAR,
  useWorkbenchPaneWidth,
} from '@/composables/useWorkbenchPaneWidth'
import type { MessageThread } from '@/shared/messagesThreads'

const keyword = ref('')
const isMobile = ref(false)
const chatRef = ref<HTMLElement | null>(null)
const resizing = ref(false)
let mediaQuery: MediaQueryList | null = null

/* 中栏宽度与分组导航共用一份值（useWorkbenchPaneWidth）：本页只按自己的上下限夹取显示 */
const { paneWidth, persistPaneWidth } = useWorkbenchPaneWidth()

const INBOX_WIDTH_MIN = 280
const INBOX_WIDTH_MAX = 520
const INBOX_WIDTH_DEFAULT = 360
const CHAT_PANE_MIN_WIDTH = 360
const SPLITTER_WIDTH = 12

const {
  isDevWorkbench,
  loading,
  allThreads,
  activeRequirementId,
  token,
  username,
  openThread,
  closeConversation,
  setThreadPinned,
  removeThread,
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
const isConversationOpen = computed(() => selectedRequirementId.value !== '')
/** 本页的会话列表宽度：共用值按会话区的上下限夹取（未拖动过时用默认 360） */
const inboxWidth = computed(() => normalizeInboxWidth(paneWidth.value ?? INBOX_WIDTH_DEFAULT))
const workbenchChatStyle = computed<Record<string, string>>(() => ({
  [WORKBENCH_PANE_WIDTH_CSS_VAR]: `${inboxWidth.value}px`,
}))

function syncMobile(event?: MediaQueryListEvent) {
  isMobile.value = event?.matches ?? mediaQuery?.matches ?? false
  if (isMobile.value) {
    finishResizeStyles()
  }
}

onMounted(() => {
  if (typeof window.matchMedia !== 'function') {
    return
  }
  mediaQuery = window.matchMedia('(max-width: 900px)')
  syncMobile()
  mediaQuery.addEventListener('change', syncMobile)
})

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener('change', syncMobile)
  finishResizeStyles()
})

function selectThread(thread: MessageThread) {
  openThread(thread)
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

function finishResizeStyles() {
  resizing.value = false
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function startResize(event: PointerEvent) {
  if (isMobile.value) {
    return
  }
  // 先把当前生效宽度落成共用值，拖动基于它增减（共用值可能是分组导航那边设的）
  paneWidth.value = inboxWidth.value
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
  paneWidth.value = normalizeInboxWidth(event.clientX - left)
}

function stopResize(event: PointerEvent) {
  if (!resizing.value) {
    return
  }
  persistPaneWidth(inboxWidth.value)
  const splitter = event.currentTarget as HTMLElement | null
  if (splitter?.hasPointerCapture?.(event.pointerId)) {
    splitter.releasePointerCapture(event.pointerId)
  }
  finishResizeStyles()
}

function resetInboxWidth() {
  persistPaneWidth(normalizeInboxWidth(INBOX_WIDTH_DEFAULT))
}

function resizeInboxByKeyboard(event: KeyboardEvent) {
  const step = event.shiftKey ? 48 : 16
  let nextWidth = inboxWidth.value

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
  persistPaneWidth(normalizeInboxWidth(nextWidth))
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
        @select="selectThread"
        @pin="setThreadPinned"
        @remove="removeThread"
      />
    </div>

    <WorkbenchPaneResizer
      label="调整会话列表宽度"
      :value-min="INBOX_WIDTH_MIN"
      :value-max="INBOX_WIDTH_MAX"
      :value-now="inboxWidth"
      @reset="resetInboxWidth"
      @keydown="resizeInboxByKeyboard"
      @pointerdown="startResize"
      @pointermove="resizeInbox"
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
