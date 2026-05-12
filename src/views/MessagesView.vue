<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import {
  listRequirementConversations,
  subscribeRequirementConversationEvents,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import {
  listRequirements,
  type RequirementItem,
  type RequirementStatus,
} from '@/api/requirements'
import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'

type MessageFilter = 'all' | 'active' | 'pending'

type MessageThread = {
  key: string
  kind: 'conversation' | 'pending'
  requirementId: string
  title: string
  statusLabel: string
  modeLabel: string
  partnerLabel: string
  lastLabel: string
  description: string
  actionLabel: string
  sortTime: number
}

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const conversations = ref<RequirementConversation[]>([])
const requirements = ref<RequirementItem[]>([])
const activeFilter = ref<MessageFilter>('all')
const activeRequirementId = ref('')
const activeTitle = ref('')
const realtimeStatus = ref<RealtimeStatus>('idle')
const realtimeError = ref('')
let stopRealtimeEvents: (() => void) | null = null
const currentMessagesRouteName = computed(() => (route.name === 'messages' ? 'messages' : 'workbench-messages'))

const requirementById = computed(() =>
  Object.fromEntries(requirements.value.map((item) => [item.requirement_id, item])),
)
const conversationRequirementIds = computed(() => new Set(conversations.value.map((item) => item.requirement_id)))
const activeConversations = computed(() =>
  conversations.value.filter((item) => {
    const requirement = requirementById.value[item.requirement_id]
    return item.status === 'open' && item.requirement_status !== 'completed' && requirement?.status !== 'completed'
  }),
)
const readyRequirements = computed(() =>
  requirements.value.filter((item) => hasBoundResource(item) && item.status !== 'completed' && item.status !== 'final_paid'),
)
const pendingRequirements = computed(() =>
  readyRequirements.value.filter((item) => !conversationRequirementIds.value.has(item.requirement_id)),
)
const conversationThreads = computed<MessageThread[]>(() =>
  activeConversations.value.map((item) => buildConversationThread(item)),
)
const pendingThreads = computed<MessageThread[]>(() =>
  pendingRequirements.value.map((item) => buildPendingThread(item)),
)
const allThreads = computed<MessageThread[]>(() =>
  [...conversationThreads.value, ...pendingThreads.value].sort((left, right) => right.sortTime - left.sortTime),
)
const filteredThreads = computed(() => {
  if (activeFilter.value === 'active') {
    return conversationThreads.value
  }
  if (activeFilter.value === 'pending') {
    return pendingThreads.value
  }
  return allThreads.value
})
const recentConversationCount = computed(() =>
  activeConversations.value.filter((item) => isRecent(item.last_message_at ?? item.updated_at)).length,
)
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

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function formatRequirementStatus(status: RequirementStatus) {
  const mapping: Record<RequirementStatus, string> = {
    pending_review: '待审核',
    rejected: '已拒绝',
    pending_deposit: '待付定金',
    deposit_paid: '待开发',
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
  }

  return mapping[status]
}

function formatPaymentMode(item?: RequirementItem) {
  if (!item) {
    return '协作模式待同步'
  }
  return item.payment_mode === 'self_managed' ? '无平台担保' : '平台担保'
}

function parseTime(value?: string | null) {
  if (!value) {
    return 0
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function formatMessageTime(value?: string | null) {
  if (!value) {
    return '暂无消息'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isRecent(value?: string | null) {
  const time = parseTime(value)
  if (!time) {
    return false
  }
  return Date.now() - time <= 7 * 24 * 60 * 60 * 1000
}

function partnerLabel(item: RequirementConversation) {
  if (auth.username === item.customer) {
    return `开发者：${item.developer}`
  }
  if (auth.username === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
}

function lastMessageLabel(item: RequirementConversation) {
  if (!item.last_message_at) {
    return '会话已创建，等待第一条消息'
  }

  const sender = item.last_message_by === auth.username ? '我' : item.last_message_by || '对方'
  return `${formatMessageTime(item.last_message_at)} · ${sender}`
}

function buildConversationThread(item: RequirementConversation): MessageThread {
  const requirement = requirementById.value[item.requirement_id]
  return {
    key: `conversation-${item.conversation_id}`,
    kind: 'conversation',
    requirementId: item.requirement_id,
    title: item.requirement_title || requirement?.title || item.requirement_id,
    statusLabel: requirement ? formatRequirementStatus(requirement.status) : item.status === 'open' ? '沟通中' : '已关闭',
    modeLabel: formatPaymentMode(requirement),
    partnerLabel: partnerLabel(item),
    lastLabel: lastMessageLabel(item),
    description: item.last_message_at ? '继续跟进需求细节、交付版本或付款确认。' : '会话已开启，可以发送第一条消息。',
    actionLabel: item.last_message_at ? '查看沟通' : '开始沟通',
    sortTime: parseTime(item.last_message_at ?? item.updated_at ?? item.created_at),
  }
}

function buildPendingThread(item: RequirementItem): MessageThread {
  return {
    key: `pending-${item.requirement_id}`,
    kind: 'pending',
    requirementId: item.requirement_id,
    title: item.title,
    statusLabel: formatRequirementStatus(item.status),
    modeLabel: formatPaymentMode(item),
    partnerLabel: '会话待开启',
    lastLabel: '打开后创建沟通会话',
    description: '需求已接取但本地尚未拿到会话记录，打开后会自动同步。',
    actionLabel: '开启会话',
    sortTime: parseTime(item.updated_at),
  }
}

function threadAvatarText(item: MessageThread) {
  const source = item.partnerLabel.replace(/^(开发者：|用户：)/, '').trim() || item.title.trim()
  return source.slice(0, 1).toUpperCase()
}

function emptyTitle() {
  if (activeFilter.value === 'active') {
    return '还没有已开启的会话'
  }
  if (activeFilter.value === 'pending') {
    return '没有待开启的会话'
  }
  return '暂无消息'
}

function emptyDescription() {
  if (activeFilter.value === 'active') {
    return '需求被开发者接取后，会自动出现在这里。'
  }
  if (activeFilter.value === 'pending') {
    return '当前可沟通的需求都已经同步为会话。'
  }
  return '当需求被开发者接取后，你可以在消息中心继续沟通需求细节。'
}

function showThread(item: MessageThread) {
  activeRequirementId.value = item.requirementId
  activeTitle.value = item.title
}

function openThread(item: MessageThread) {
  if ((route.name === 'workbench-messages' || route.name === 'messages') && route.query.requirement_id === item.requirementId) {
    showThread(item)
    return
  }

  void router.push({
    name: currentMessagesRouteName.value,
    query: {
      requirement_id: item.requirementId,
    },
  })
}

function openThreadFromRoute() {
  const requirementId = typeof route.query.requirement_id === 'string' ? route.query.requirement_id : ''
  if (!requirementId) {
    activeRequirementId.value = ''
    activeTitle.value = ''
    return
  }

  const thread = allThreads.value.find((item) => item.requirementId === requirementId)
  if (!thread) {
    return
  }

  showThread(thread)
}

function closeConversation() {
  void router.push({ name: currentMessagesRouteName.value })
}

function applyConversationDetail(payload: RequirementConversationDetail) {
  const nextConversation = payload.conversation
  const index = conversations.value.findIndex((item) => item.requirement_id === nextConversation.requirement_id)
  if (index >= 0) {
    conversations.value = conversations.value.map((item, itemIndex) => (itemIndex === index ? nextConversation : item))
    return
  }

  conversations.value = [nextConversation, ...conversations.value]
}

function connectRealtime() {
  if (stopRealtimeEvents) {
    stopRealtimeEvents()
    stopRealtimeEvents = null
  }

  if (!auth.token.trim()) {
    realtimeStatus.value = 'idle'
    realtimeError.value = ''
    return
  }

  realtimeStatus.value = 'connecting'
  realtimeError.value = ''
  stopRealtimeEvents = subscribeRequirementConversationEvents(auth.token, {
    onUpdate: (payload) => {
      applyConversationDetail(payload)
      openThreadFromRoute()
    },
    onOpen: () => {
      realtimeStatus.value = 'connected'
      realtimeError.value = ''
    },
    onClose: () => {
      if (auth.token.trim()) {
        realtimeStatus.value = 'connecting'
      }
    },
    onError: (error) => {
      realtimeStatus.value = 'error'
      realtimeError.value = error.message
    },
  })
}

function disconnectRealtime() {
  if (stopRealtimeEvents) {
    stopRealtimeEvents()
    stopRealtimeEvents = null
  }
  realtimeStatus.value = 'idle'
  realtimeError.value = ''
}

async function loadMessages(showSuccess = false) {
  auth.hydrate()
  if (!auth.token.trim()) {
    conversations.value = []
    requirements.value = []
    disconnectRealtime()
    return
  }

  loading.value = true
  try {
    const [nextRequirements, nextConversations] = await Promise.all([
      listRequirements(auth.token),
      listRequirementConversations(auth.token),
    ])
    requirements.value = nextRequirements
    conversations.value = nextConversations
    openThreadFromRoute()
    if (showSuccess) {
      showToast('消息已刷新', 'success')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载消息失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await loadMessages()
  connectRealtime()
})

onBeforeUnmount(() => {
  disconnectRealtime()
})

watch(
  () => route.query.requirement_id,
  () => {
    openThreadFromRoute()
  },
)

watch(
  () => auth.token,
  () => {
    connectRealtime()
  },
)
</script>

<template>
  <main class="page-shell custom-page-shell messages-page">
    <section v-if="!activeRequirementId" class="messages-summary" aria-label="消息概览">
      <article class="messages-summary__item">
        <strong>{{ activeConversations.length }}</strong>
        <span>已开启会话</span>
      </article>
      <article class="messages-summary__item">
        <strong>{{ pendingThreads.length }}</strong>
        <span>待同步会话</span>
      </article>
      <article class="messages-summary__item">
        <strong>{{ recentConversationCount }}</strong>
        <span>近 7 天更新</span>
      </article>
    </section>

    <RequirementConversationModal v-if="activeRequirementId" display-mode="inline" :visible="true" :token="auth.token"
      :current-username="auth.username" :requirement-id="activeRequirementId" :title="activeTitle"
      @updated="applyConversationDetail" @close="closeConversation" />

    <section v-else class="messages-panel">
      <header class="messages-panel__header">
        <div>
          <h2>会话列表</h2>
          <p>点击任意会话即可查看历史消息并继续回复。</p>
        </div>
        <div class="messages-panel__tools">
          <span v-if="auth.token" class="messages-live-state" :class="`messages-live-state--${realtimeStatus}`"
            :title="realtimeError">
            {{ realtimeStatusLabel }}
          </span>
          <button class="ghost small" type="button" :disabled="loading" @click="loadMessages(true)">
            {{ loading ? '刷新中...' : '刷新消息' }}
          </button>
          <div class="messages-filter" role="tablist" aria-label="消息筛选">
            <button type="button" :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">
              全部
            </button>
            <button type="button" :class="{ active: activeFilter === 'active' }" @click="activeFilter = 'active'">
              已开启
            </button>
            <button type="button" :class="{ active: activeFilter === 'pending' }" @click="activeFilter = 'pending'">
              待同步
            </button>
          </div>
        </div>
      </header>

      <div v-if="loading" class="messages-state">消息加载中...</div>
      <div v-else-if="filteredThreads.length === 0" class="messages-empty">
        <strong>{{ emptyTitle() }}</strong>
        <p>{{ emptyDescription() }}</p>
        <button v-if="activeFilter !== 'all'" class="ghost small" type="button" @click="activeFilter = 'all'">
          查看全部
        </button>
      </div>
      <div v-else class="messages-thread-list">
        <button v-for="item in filteredThreads" :key="item.key" type="button" class="messages-thread"
          :class="{ 'messages-thread--pending': item.kind === 'pending' }" @click="openThread(item)">
          <span class="messages-thread__avatar" aria-hidden="true">{{ threadAvatarText(item) }}</span>
          <span class="messages-thread__status">{{ item.statusLabel }}</span>
          <span class="messages-thread__main">
            <strong>{{ item.title }}</strong>
            <small>{{ item.requirementId }} · {{ item.modeLabel }}</small>
            <span>{{ item.description }}</span>
          </span>
          <span class="messages-thread__meta">
            <span>{{ item.partnerLabel }}</span>
            <time>{{ item.lastLabel }}</time>
          </span>
          <span class="messages-thread__action">{{ item.actionLabel }}</span>
        </button>
      </div>
    </section>

  </main>
</template>

<style scoped>
.messages-page {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
}

.messages-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.messages-summary__item,
.messages-panel {
  border: 1px solid rgba(224, 232, 255, 0.96);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.messages-summary__item {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
}

.messages-summary__item strong {
  flex: 0 0 auto;
  color: #0f172a;
  font-size: 24px;
  line-height: 1;
}

.messages-summary__item span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
}

.messages-panel {
  padding: 16px;
  border-radius: 16px;
}

.messages-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.messages-panel__header h2,
.messages-panel__header p {
  margin: 0;
}

.messages-panel__header h2 {
  color: #0f172a;
  font-size: 18px;
}

.messages-panel__header p {
  margin-top: 4px;
  color: #64748b;
  font-size: 13px;
}

.messages-panel__tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.messages-live-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 12px;
  white-space: nowrap;
}

.messages-live-state::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #94a3b8;
}

.messages-live-state--connected::before {
  background: #16a34a;
}

.messages-live-state--connecting::before {
  background: #2563eb;
}

.messages-live-state--error::before {
  background: #d97706;
}

.messages-filter {
  display: inline-flex;
  flex: 0 0 auto;
  padding: 4px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 14px;
  background: #f8fbff;
}

.messages-filter button {
  min-width: 70px;
  border: 0;
  border-radius: 10px;
  padding: 8px 12px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
}

.messages-filter button.active {
  background: #ffffff;
  color: #1d4ed8;
  box-shadow: 0 8px 16px rgba(76, 103, 172, 0.12);
}

.messages-state,
.messages-empty {
  display: grid;
  place-items: center;
  min-height: 148px;
  border: 1px dashed rgba(204, 214, 237, 0.98);
  border-radius: 14px;
  background: rgba(248, 251, 255, 0.8);
  color: #64748b;
  text-align: center;
}

.messages-empty {
  gap: 10px;
  padding: 24px;
}

.messages-empty strong {
  color: #0f172a;
  font-size: 17px;
}

.messages-empty p {
  max-width: 460px;
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.messages-thread-list {
  display: grid;
  gap: 8px;
}

.messages-thread {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(180px, 240px) auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 14px;
  background: #ffffff;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(76, 103, 172, 0.05);
}

.messages-thread:hover {
  border-color: rgba(125, 155, 225, 0.92);
  background: #f8fbff;
  box-shadow: 0 8px 18px rgba(76, 103, 172, 0.08);
}

.messages-thread--pending {
  background: #fffdf7;
}

.messages-thread__avatar {
  display: none;
}

.messages-thread__status,
.messages-thread__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.messages-thread__status {
  padding: 5px 9px;
  background: rgba(245, 158, 11, 0.14);
  color: #92400e;
}

.messages-thread__main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.messages-thread__main strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.messages-thread__main small,
.messages-thread__main span,
.messages-thread__meta {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.messages-thread__main span {
  overflow-wrap: anywhere;
}

.messages-thread__meta {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.messages-thread__meta span,
.messages-thread__meta time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.messages-thread__action {
  padding: 7px 10px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
}

.messages-page button.ghost.small {
  border-color: rgba(209, 220, 243, 0.95);
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.messages-page button.ghost:hover:not(:disabled) {
  background: #f8fbff;
  border-color: rgba(125, 155, 225, 0.92);
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
}

@media (max-width: 900px) {
  .messages-page {
    width: 100%;
    margin: 0;
    padding: 8px 8px 0;
    gap: 0;
  }

  .messages-summary {
    display: none;
  }

  .messages-panel {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .messages-panel__header {
    display: none;
  }

  .messages-state,
  .messages-empty {
    min-height: calc(100vh - 140px);
    border-radius: 18px;
  }

  .messages-thread-list {
    gap: 0;
    overflow: hidden;
    border: 1px solid rgba(224, 232, 255, 0.88);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
  }

  .messages-thread {
    grid-template-columns: 48px minmax(0, 1fr) auto;
    grid-template-areas:
      "avatar main meta"
      "avatar main status";
    gap: 0 10px;
    min-height: 74px;
    padding: 12px;
    border: 0;
    border-bottom: 1px solid rgba(226, 232, 240, 0.8);
    border-radius: 0;
    box-shadow: none;
  }

  .messages-thread:last-child {
    border-bottom: 0;
  }

  .messages-thread__avatar {
    grid-area: avatar;
    align-self: center;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, #2f68ff, #3fb7a6);
    color: #ffffff;
    font-size: 18px;
    font-weight: 800;
  }

  .messages-thread--pending .messages-thread__avatar {
    background: linear-gradient(135deg, #f59e0b, #ef7f5f);
  }

  .messages-thread__main {
    grid-area: main;
    align-self: center;
    gap: 4px;
  }

  .messages-thread__main strong {
    font-size: 15px;
    line-height: 1.25;
  }

  .messages-thread__main small {
    display: none;
  }

  .messages-thread__main span {
    overflow: hidden;
    color: #64748b;
    font-size: 13px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .messages-thread__meta {
    grid-area: meta;
    align-self: start;
    justify-items: end;
    min-width: 58px;
    padding-top: 2px;
  }

  .messages-thread__meta span {
    display: none;
  }

  .messages-thread__meta time {
    color: #94a3b8;
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .messages-thread__status {
    grid-area: status;
    align-self: end;
    justify-self: end;
    max-width: 74px;
    padding: 2px 7px;
    overflow: hidden;
    font-size: 10px;
    line-height: 1.4;
    text-overflow: ellipsis;
  }

  .messages-thread__action {
    display: none;
  }
}

@media (max-width: 420px) {

  .messages-panel {
    padding: 0;
  }

  .messages-thread {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    min-height: 70px;
    padding: 11px 10px;
  }

  .messages-thread__avatar {
    width: 40px;
    height: 40px;
    border-radius: 13px;
    font-size: 17px;
  }

  .messages-thread__status {
    max-width: 62px;
  }
}
</style>
