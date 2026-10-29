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
let mediaQuery: MediaQueryList | null = null

const {
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

function syncMobile(event?: MediaQueryListEvent) {
  isMobile.value = event?.matches ?? mediaQuery?.matches ?? false
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
})

function selectThread(thread: MessageThread) {
  openThread(thread)
}

function composeConversation() {
  void router.push({ name: 'workbench-requirements' })
}
</script>

<template>
  <section
    class="workbench-chat"
    :class="{ 'workbench-chat--conversation-open': isConversationOpen }"
    aria-label="消息工作台"
    data-testid="workbench-chat"
  >
    <WorkbenchChatInbox
      v-model:keyword="keyword"
      :threads="visibleThreads"
      :selected-requirement-id="selectedRequirementId"
      :loading="loading"
      :unread-count="unreadCount"
      @select="selectThread"
      @compose="composeConversation"
    />

    <section class="workbench-chat__pane">
      <RequirementConversationModal
        v-if="selectedThread"
        display-mode="inline"
        :visible="true"
        :token="token"
        api-mode="user"
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
