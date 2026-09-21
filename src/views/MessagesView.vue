<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, Search } from '@element-plus/icons-vue'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import { apiUrl } from '@/api/http'
import {
  listConversationHistoryDisclosures,
  listRequirementConversations,
  respondConversationHistoryDisclosure,
  subscribeRequirementConversationEvents,
  type ConversationHistoryDisclosure,
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
import { requirementStatusLabel } from '@/shared/requirementStatus'

type MessageFilter = 'all' | 'active' | 'pending'

/** 会话行的状态色调：决定左侧色条与状态胶囊的颜色。
 *  四档只对 requirementStatusLabel 里已有的状态值分组，不新增业务语义。 */
type ThreadTone = 'attention' | 'active' | 'done' | 'closed'

type MessageThread = {
  key: string
  kind: 'conversation' | 'pending'
  requirementId: string
  title: string
  statusLabel: string
  tone: ThreadTone
  modeLabel: string
  partnerLabel: string
  lastLabel: string
  description: string
  actionLabel: string
  avatarUrl: string
  avatarText: string
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
const searchKeyword = ref('')
const failedAvatarUrls = ref<Set<string>>(new Set())
const activeRequirementId = ref('')
const activeTitle = ref('')
const realtimeStatus = ref<RealtimeStatus>('idle')
const realtimeError = ref('')
const historyDisclosures = ref<ConversationHistoryDisclosure[]>([])
const historyVotingId = ref<number | null>(null)
let stopRealtimeEvents: (() => void) | null = null
// 消息中心有三个入口（独立页 /messages、用户工作台、开发者工作台），
// 页面内切换会话时保持停留在当前入口，避免把开发者带回用户工作台。
const MESSAGES_ROUTE_NAMES = ['messages', 'workbench-messages', 'dev-messages']
const currentMessagesRouteName = computed(() =>
  MESSAGES_ROUTE_NAMES.includes(String(route.name ?? '')) ? String(route.name) : 'workbench-messages',
)

const requirementById = computed(() =>
  Object.fromEntries(requirements.value.map((item) => [item.requirement_id, item])),
)
const conversationRequirementIds = computed(() => new Set(conversations.value.map((item) => item.requirement_id)))
const activeConversations = computed(() =>
  conversations.value.filter((item) => item.status === 'open'),
)
const readyRequirements = computed(() =>
  requirements.value.filter((item) => hasBoundResource(item) && item.status !== 'completed'),
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
  const normalizedKeyword = searchKeyword.value.trim().toLowerCase()
  const matchesKeyword = (item: MessageThread) => {
    if (!normalizedKeyword) {
      return true
    }

    return [
      item.requirementId,
      item.title,
      item.statusLabel,
      item.modeLabel,
      item.partnerLabel,
      item.lastLabel,
      item.description,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedKeyword)
  }

  if (activeFilter.value === 'active') {
    return conversationThreads.value.filter(matchesKeyword)
  }
  if (activeFilter.value === 'pending') {
    return pendingThreads.value.filter(matchesKeyword)
  }
  return allThreads.value.filter(matchesKeyword)
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
/**
 * 待我确认的历史沟通公开申请。
 *
 * 前任开发者已经读不到这条会话（不再是参与方），所以由消息中心给他入口：
 * 只要两票里还差他这一票，就在这里列出。
 */
const pendingHistoryVotes = computed(() =>
  historyDisclosures.value.filter((item) => {
    if (item.status !== 'pending') {
      return false
    }
    if (auth.username === item.previous_developer) {
      return item.developer_consent === 'pending'
    }
    if (auth.username === item.customer) {
      return item.customer_consent === 'pending'
    }
    return false
  }),
)

function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}

function formatRequirementStatus(status: RequirementStatus) {
  return requirementStatusLabel(status)
}

/** 需求状态归成四档色调：待用户动手 / 进行中 / 已结单 / 已关闭。
 *  未列出的状态（pending_review、pending_deposit、rejected… 里未单列的）都归「待处理」。 */
function threadToneOf(status?: string): ThreadTone {
  switch (status) {
    case 'completed':
      return 'done'
    case 'cancelled':
    case 'rejected':
      return 'closed'
    case 'deposit_paid':
    case 'in_development':
    case 'pending_final':
    case 'pending_settlement':
      return 'active'
    default:
      return 'attention'
  }
}

function formatPaymentMode(item?: RequirementItem) {
  if (!item) {
    return '协作模式待同步'
  }
  return item.payment_mode === 'self_managed' ? '无电签约定' : '电签担保'
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
    // 这一格只回答「上一次动静是什么时候」。空会话左边那行预览已经写过「会话已开启，
    // 可以发送第一条消息」，两处各说一遍只是让右侧多出一条更长的句子。
    return '暂无消息'
  }

  const sender =
    item.last_message_by === auth.username
      ? '我'
      : item.last_message_by === 'platform'
        ? '系统'
        : item.last_message_by || '对方'
  return `${formatMessageTime(item.last_message_at)} · ${sender}`
}

function latestMessagePreview(item: RequirementConversation) {
  if (!item.last_message_at) {
    return '会话已开启，可以发送第一条消息。'
  }
  if (item.last_message_attachment_url?.trim()) {
    return '[附件]'
  }

  const content = item.last_message_content?.trim().replace(/\s+/g, ' ')
  return content || '[附件]'
}

function avatarText(value?: string | null) {
  const normalized = value?.trim() || 'U'
  return normalized.slice(0, 1).toUpperCase()
}

function customerAvatarUrl(item: RequirementConversation) {
  const avatarUrl = item.customer_avatar_url?.trim()
  const src = avatarUrl ? apiUrl(avatarUrl) : ''
  return src && !failedAvatarUrls.value.has(src) ? src : ''
}

function buildConversationThread(item: RequirementConversation): MessageThread {
  const requirement = requirementById.value[item.requirement_id]
  // 需求数据缺失时退回会话自身的状态：沟通中算进行中，已关闭算已关闭。
  const statusLabel = requirement ? formatRequirementStatus(requirement.status) : item.status === 'open' ? '沟通中' : '已关闭'
  const tone: ThreadTone = requirement ? threadToneOf(requirement.status) : item.status === 'open' ? 'active' : 'closed'
  return {
    key: `conversation-${item.conversation_id}`,
    kind: 'conversation',
    requirementId: item.requirement_id,
    title: item.requirement_title || requirement?.title || item.requirement_id,
    statusLabel,
    tone,
    modeLabel: formatPaymentMode(requirement),
    partnerLabel: partnerLabel(item),
    lastLabel: lastMessageLabel(item),
    description: latestMessagePreview(item),
    actionLabel: item.last_message_at ? '查看沟通' : '开始沟通',
    avatarUrl: customerAvatarUrl(item),
    avatarText: avatarText(item.customer || item.requirement_title),
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
    tone: threadToneOf(item.status),
    modeLabel: formatPaymentMode(item),
    partnerLabel: '会话待开启',
    lastLabel: '打开后创建沟通会话',
    description: '需求已接取但本地尚未拿到会话记录，打开后会自动同步。',
    actionLabel: '开启会话',
    avatarUrl: '',
    avatarText: avatarText(item.creator || item.title),
    sortTime: parseTime(item.updated_at),
  }
}

function threadAvatarText(item: MessageThread) {
  return item.avatarText
}

function handleThreadAvatarError(item: MessageThread) {
  if (!item.avatarUrl) return

  const next = new Set(failedAvatarUrls.value)
  next.add(item.avatarUrl)
  failedAvatarUrls.value = next
}

function emptyTitle() {
  if (searchKeyword.value.trim()) {
    return '没有匹配的会话'
  }
  if (activeFilter.value === 'active') {
    return '还没有已开启的会话'
  }
  if (activeFilter.value === 'pending') {
    return '没有待开启的会话'
  }
  return '暂无消息'
}

function emptyDescription() {
  if (searchKeyword.value.trim()) {
    return '换个关键词，或清空搜索后查看全部消息。'
  }
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

function clearSearch() {
  searchKeyword.value = ''
}

function openThread(item: MessageThread) {
  if (MESSAGES_ROUTE_NAMES.includes(String(route.name ?? '')) && route.query.requirement_id === item.requirementId) {
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

async function loadHistoryDisclosures() {
  if (!auth.token.trim()) {
    historyDisclosures.value = []
    return
  }

  try {
    historyDisclosures.value = await listConversationHistoryDisclosures(auth.token)
  } catch {
    // 公开申请只是消息中心的附加待办，拉取失败不影响会话列表本身
    historyDisclosures.value = []
  }
}

async function respondHistoryDisclosure(
  item: ConversationHistoryDisclosure,
  decision: 'approved' | 'rejected',
) {
  if (!auth.token.trim() || historyVotingId.value !== null) {
    return
  }

  historyVotingId.value = item.id
  try {
    await respondConversationHistoryDisclosure(auth.token, item.id, decision)
    showToast(decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通', 'success')
    await loadHistoryDisclosures()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '提交表决失败', 'warning')
  } finally {
    historyVotingId.value = null
  }
}

async function loadMessages(showSuccess = false) {
  auth.hydrate()
  if (!auth.token.trim()) {
    conversations.value = []
    requirements.value = []
    historyDisclosures.value = []
    disconnectRealtime()
    return
  }

  loading.value = true
  try {
    const [nextRequirements, nextConversations] = await Promise.all([
      listRequirements(auth.token),
      listRequirementConversations(auth.token),
      // 待办是前任开发者在消息中心唯一的表决入口（他读不到会话本身），
      // 拉取要与会话列表并列，不能被那两个请求的失败带着一起跳过
      loadHistoryDisclosures(),
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
      <header class="messages-search-bar">
        <form class="messages-search mobile-search-form" aria-label="搜索消息" @submit.prevent>
          <el-icon class="mobile-search-icon">
            <Search />
          </el-icon>
          <input v-model="searchKeyword" type="search" inputmode="search" enterkeyhint="search" autocomplete="off"
            spellcheck="false" placeholder="搜索需求标题、编号、对方或消息..." @keydown.esc="clearSearch" />
          <button v-if="searchKeyword.trim()" type="button" class="messages-search__clear" aria-label="清空搜索关键词"
            title="清空搜索" @click="clearSearch">
            ×
          </button>
        </form>
      </header>

      <header class="messages-panel__header">
        <div>
          <h2>会话列表</h2>
        </div>
        <div class="messages-panel__tools">
          <span v-if="auth.token" class="messages-live-state" :class="`messages-live-state--${realtimeStatus}`"
            :title="realtimeError">
            {{ realtimeStatusLabel }}
          </span>
          <button class="ghost small messages-refresh" type="button" :disabled="loading" aria-label="刷新消息"
            title="刷新消息" @click="loadMessages(true)">
            <el-icon>
              <Refresh />
            </el-icon>
          </button>
          <el-select v-model="activeFilter" class="messages-filter" aria-label="消息筛选">
            <el-option label="全部" value="all" />
            <el-option label="已开启" value="active" />
            <el-option label="待同步" value="pending" />
          </el-select>
        </div>
      </header>

      <section v-if="pendingHistoryVotes.length" class="messages-disclosure-panel"
        aria-label="待我确认的历史沟通公开申请">
        <article v-for="item in pendingHistoryVotes" :key="`history-vote-${item.id}`" class="messages-disclosure">
          <div class="messages-disclosure__main">
            <strong>{{ item.requirement_title || item.requirement_id }}</strong>
            <small>{{ item.requirement_id }} · 前任开发者 {{ item.previous_developer }}</small>
            <p>
              现任开发者 {{ item.current_developer }} 申请查看前任开发者 {{ item.previous_developer }} 负责期间的沟通记录。你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
            </p>
          </div>
          <div class="messages-disclosure__actions">
            <button type="button" class="ghost small" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'approved')">
              同意公开
            </button>
            <button type="button" class="ghost small" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'rejected')">
              拒绝
            </button>
          </div>
        </article>
      </section>

      <div v-if="loading" class="messages-state">消息加载中...</div>
      <div v-else-if="filteredThreads.length === 0 && pendingHistoryVotes.length === 0" class="messages-empty">
        <strong>{{ emptyTitle() }}</strong>
        <p>{{ emptyDescription() }}</p>
        <button v-if="searchKeyword.trim()" class="ghost small" type="button" @click="clearSearch">
          清空搜索
        </button>
        <button v-if="activeFilter !== 'all'" class="ghost small" type="button" @click="activeFilter = 'all'">
          查看全部
        </button>
      </div>
      <div v-else class="messages-thread-list">
        <button v-for="item in filteredThreads" :key="item.key" type="button" class="messages-thread"
          :class="[`messages-thread--${item.tone}`, { 'messages-thread--pending': item.kind === 'pending' }]"
          @click="openThread(item)">
          <span class="messages-thread__avatar" aria-hidden="true">
            <img v-if="item.avatarUrl" :src="item.avatarUrl" :alt="`${item.title} 发布者头像`" loading="lazy"
              @error="handleThreadAvatarError(item)" />
            <span v-else>{{ threadAvatarText(item) }}</span>
          </span>
          <span class="messages-thread__status">{{ item.statusLabel }}</span>
          <span class="messages-thread__main">
            <strong>{{ item.title }}</strong>
            <small class="messages-thread__sub">
              <span class="messages-thread__code">{{ item.requirementId }}</span>
              <span class="messages-thread__mode">{{ item.modeLabel }}</span>
            </small>
            <span class="messages-thread__desc">{{ item.description }}</span>
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

.messages-search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.messages-search.mobile-search-form {
  display: inline-flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 9px;
  min-height: 38px;
  padding: 0 10px 0 12px;
  border-radius: 999px !important;
  border: 1px solid rgba(203, 213, 225, 0.86);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  color: #64748b;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;
}

.messages-search.mobile-search-form:hover,
.messages-search.mobile-search-form:focus-within {
  border-color: rgba(147, 197, 253, 0.96);
  background: #fff;
}

.messages-search .mobile-search-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: #64748b;
  transition: color 160ms ease;
}

.messages-search.mobile-search-form:hover .mobile-search-icon,
.messages-search.mobile-search-form:focus-within .mobile-search-icon {
  color: #2563eb;
}

.messages-search input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  caret-color: #2563eb;
  color: #0f172a;
  font: inherit;
  font-size: 14px;
  line-height: 1.4;
  text-overflow: ellipsis;
}

.messages-search input::placeholder {
  color: #94a3b8;
  font-weight: 500;
}

.messages-search input::-webkit-search-cancel-button,
.messages-search input::-webkit-search-decoration {
  appearance: none;
  display: none;
}

.messages-search__clear {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(226, 232, 240, 0.72);
  color: #64748b;
  cursor: pointer;
  font: inherit;
  font-size: 18px;
  line-height: 1;
}

.messages-search__clear:hover {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.messages-search--detail {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.messages-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.messages-back-btn__icon {
  font-size: 20px;
  font-weight: 800;
  line-height: 1;
}

.messages-back-btn__text {
  display: none;
}

.messages-detail-title {
  overflow: hidden;
  color: #0f172a;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* 图标按钮：覆盖 shell.css 里 button.ghost.small 的 padding，做成正方形 */
.messages-page button.messages-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 35px;
  height: 35px;
  padding: 0;
  font-size: 16px;
}

.messages-filter {
  flex: 0 0 auto;
  width: 118px;
}

.messages-filter :deep(.el-select__wrapper) {
  min-height: 35px;
  padding: 0 10px;
  border: 1px solid rgba(209, 220, 243, 0.95);
  border-radius: 10px;
  background: #ffffff;
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
  color: #0f172a;
  font-weight: 700;
}

.messages-filter :deep(.el-select__wrapper:hover),
.messages-filter :deep(.el-select__wrapper.is-focused) {
  border-color: rgba(125, 155, 225, 0.92);
  box-shadow: 0 12px 24px rgba(76, 103, 172, 0.1);
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

/* 待我确认的历史沟通公开申请：会话列表上方一条待办 */
.messages-disclosure-panel {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.messages-disclosure {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  padding: 12px 14px;
  border: 1px solid rgba(222, 189, 120, 0.5);
  border-radius: 14px;
  background: #fffaf0;
}

.messages-disclosure__main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.messages-disclosure__main strong {
  color: #0f172a;
  font-size: 14px;
}

.messages-disclosure__main small {
  color: #92400e;
  font-size: 12px;
}

.messages-disclosure__main p {
  margin: 0;
  color: #64748b;
  font-size: 12.5px;
  line-height: 1.6;
}

.messages-disclosure__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

/* 会话行：左边缘一条状态色条，左边是头像与状态胶囊，中间三行（标题 / 编号·模式 / 最新动静），
   右边一列对方·时间（带竖分隔线）与主操作胶囊。整行按行块垂直居中。
   色条与状态胶囊按状态分四档（待处理 / 进行中 / 已结单 / 已关闭），一列扫下来状态就看得见。
   状态胶囊占一列固定宽度：标签长短不一，若让它按内容撑开，每行的标题就会左右错位。 */
.messages-thread {
  /* 无色调时的兜底：色条 / 胶囊底色与字色 / 常态与悬停底色 */
  --thread-rail: rgba(224, 232, 255, 0.96);
  --thread-status-soft: rgba(245, 158, 11, 0.14);
  --thread-status-ink: #92400e;
  --thread-surface: #ffffff;
  --thread-surface-hover: linear-gradient(90deg, rgba(79, 140, 255, 0.08), rgba(255, 255, 255, 0) 54%), #f8fbff;
  position: relative;
  z-index: 0;
  width: 100%;
  display: grid;
  grid-template-columns: 44px 84px minmax(0, 1fr) minmax(0, max-content) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid rgba(224, 232, 255, 0.96);
  border-radius: 16px;
  background: var(--thread-surface);
  color: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  box-shadow: 0 6px 16px rgba(76, 103, 172, 0.05);
  transition:
    border-color 180ms ease,
    box-shadow 200ms ease,
    transform 200ms ease;
}

/* 左边缘 4px 状态色条：做成伪元素而不是 border，悬停加宽时才不会顶动行内布局 */
.messages-thread::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--thread-rail);
  transition: width 180ms ease;
}

/* 四档状态色：与 profile.css 的状态色同一族（待处理=琥珀、进行中=蓝、已结单=绿、已关闭=灰） */
.messages-thread--attention {
  --thread-rail: #efae2f;
}

.messages-thread--active {
  --thread-rail: #5b8def;
  --thread-status-soft: rgba(79, 140, 255, 0.14);
  --thread-status-ink: #1d4ed8;
}

.messages-thread--done {
  --thread-rail: #34c17a;
  --thread-status-soft: rgba(34, 197, 94, 0.12);
  --thread-status-ink: #166534;
}

.messages-thread--closed {
  --thread-rail: rgba(148, 163, 184, 0.72);
  --thread-status-soft: rgba(148, 163, 184, 0.2);
  --thread-status-ink: #475569;
}

/* 悬停只换整圈描边与底色，色条保持自己的颜色——否则鼠标一过状态色就没了 */
.messages-thread:hover,
.messages-thread:focus-visible {
  z-index: 1;
  border-color: rgba(125, 155, 225, 0.92);
  background: var(--thread-surface-hover);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.13);
  transform: translateY(-1px);
}

.messages-thread:hover::before,
.messages-thread:focus-visible::before {
  width: 6px;
}

/* 键盘走到这一行时给个环，别让焦点只能靠 hover 才看得见 */
.messages-thread:focus-visible {
  outline: 2px solid rgba(47, 104, 255, 0.5);
  outline-offset: 2px;
}

/* 会话待开启：整行铺一层暖底、头像换成暖色渐变，把它和已有会话区分开 */
.messages-thread--pending {
  --thread-surface: #fffaf0;
  --thread-surface-hover: linear-gradient(90deg, rgba(245, 158, 11, 0.12), rgba(255, 255, 255, 0) 54%), #fff6e6;
}

/* 头像：门户蓝→青的字母牌，没有头像图时用发布者首字顶上。桌面与移动端都显示，
   它是这一行唯一的图形锚点——没有它，整列卡片只剩文字，扫起来很平。 */
.messages-thread__avatar {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: linear-gradient(135deg, #2f68ff, #3fb7a6);
  box-shadow: 0 6px 14px rgba(47, 104, 255, 0.18);
  color: #ffffff;
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
  overflow: hidden;
  transition:
    transform 200ms ease,
    box-shadow 200ms ease;
}

.messages-thread__avatar img,
.messages-thread__avatar>span {
  width: 100%;
  height: 100%;
  border-radius: inherit;
}

.messages-thread__avatar img {
  display: block;
  object-fit: cover;
}

.messages-thread__avatar>span {
  display: grid;
  place-items: center;
}

.messages-thread--pending .messages-thread__avatar {
  background: linear-gradient(135deg, #f59e0b, #ef7f5f);
  box-shadow: 0 6px 14px rgba(245, 158, 11, 0.2);
}

.messages-thread:hover .messages-thread__avatar,
.messages-thread:focus-visible .messages-thread__avatar {
  transform: scale(1.04);
  box-shadow: 0 8px 18px rgba(47, 104, 255, 0.26);
}

.messages-thread__status,
.messages-thread__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

/* 状态胶囊：撑满整列（84px），软底 + 深字，字色也用在前面那颗小圆点上，
   和左边缘色条呼应但不相邻，扫一眼就知道这一行落在哪一档 */
.messages-thread__status {
  gap: 5px;
  width: 100%;
  min-width: 0;
  padding: 5px 8px;
  overflow: hidden;
  /* 贴住标题那一行，而不是跟着整行居中：整行居中时它的中线落在标题与第二行之间，
     看着像悬在行左侧的独立部件；靠 start 对齐后胶囊与标题同一条线，
     读作标题的前置状态，同时保住了状态列在固定 x 上成列可扫。 */
  align-self: start;
  background: var(--thread-status-soft);
  color: var(--thread-status-ink);
  line-height: 16px;
}

.messages-thread__status::before {
  content: '';
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: currentColor;
}

.messages-thread__main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.messages-thread__main strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 16px;
  line-height: 26px;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 180ms ease;
}

.messages-thread:hover .messages-thread__main strong,
.messages-thread:focus-visible .messages-thread__main strong {
  color: #1d4ed8;
}

/* 第二行：编号加等宽数字，模式做成一枚小标签。编号是拿来对的，模式是扫一眼要认出来的，
   两者权重本来不该一样，拆开之后整行只多一枚灰标签，不会抢标题。 */
.messages-thread__sub {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

.messages-thread__code {
  min-width: 0;
  overflow: hidden;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.messages-thread__main span.messages-thread__mode {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.18);
  color: #475569;
  font-size: 11px;
  line-height: 16px;
}

/* 第三行只留一行：最新消息长短不一，放开换行会让整列行高参差，
   对不齐的列表比截断一段预览更难扫 */
.messages-thread__desc {
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧元信息：一条竖分隔线把「谁 / 什么时候」和会话内容分开，与主操作胶囊一起构成行尾。
   分隔线要按住整行高度（align-self: stretch）才像一条线，只裹住两行文字会像漂着的短杠。
   两行文字都用默认的 stretch 填满这一列（靠 text-align 右对齐），不用 justify-items: end——
   那是按内容宽度摆放，nowrap 的文字会溢出列宽压到标题上，省略号也不会生效。 */
.messages-thread__meta {
  display: grid;
  align-self: stretch;
  align-content: center;
  gap: 4px;
  min-width: 0;
  padding-left: 16px;
  border-left: 1px solid rgba(226, 232, 240, 0.9);
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
  text-align: right;
  transition: border-color 180ms ease;
}

.messages-thread:hover .messages-thread__meta,
.messages-thread:focus-visible .messages-thread__meta {
  border-left-color: rgba(125, 155, 225, 0.6);
}

.messages-thread__meta span,
.messages-thread__meta time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 时间戳比对方名更轻：对方名是「这行跟谁有关」，时间只是排序依据 */
.messages-thread__meta time {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

/* 主操作留在整行的垂直中线上：左中两列是一整块内容，操作胶囊跟着行首会显得被顶在上边。
   整行都可点，这枚胶囊是行里唯一的「按钮」，鼠标进来时填实成主色并推出箭头，指向更明确。 */
.messages-thread__action {
  gap: 4px;
  padding: 8px 13px;
  background: rgba(219, 234, 254, 0.9);
  color: #1d4ed8;
  transition:
    background-color 160ms ease,
    color 160ms ease,
    box-shadow 160ms ease;
}

/* 箭头只在行尾做一个指向动作，悬停时往右推 2px */
.messages-thread__action::after {
  content: '›';
  font-size: 15px;
  line-height: 1;
  transition: transform 180ms ease;
}

.messages-thread:hover .messages-thread__action,
.messages-thread:focus-visible .messages-thread__action {
  /* 用纯色而不是渐变：background-color 能过渡，渐变只会硬切 */
  background: #3f7cff;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(47, 104, 255, 0.28);
}

.messages-thread:hover .messages-thread__action::after,
.messages-thread:focus-visible .messages-thread__action::after {
  transform: translateX(2px);
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
    padding: 0;
    gap: 10px;
  }

  .messages-search-bar {
    position: sticky !important;
    top: 8px !important;
    z-index: 12 !important;
    display: flex !important;
    align-items: center !important;
    gap: 10px !important;
    width: calc(100% - 16px) !important;
    margin: 8px 8px 12px !important;
    height: auto !important;
    min-height: 66px !important;
    padding: 12px !important;
    border: 1px solid rgba(224, 232, 255, 0.96) !important;
    border-radius: 16px !important;
    background: rgba(255, 255, 255, 0.94) !important;
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08) !important;
  }

  .messages-search {
    height: auto !important;
    min-height: 38px !important;
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

  .messages-disclosure-panel {
    width: calc(100% - 16px);
    margin: 0 8px 10px;
  }

  .messages-disclosure {
    flex-direction: column;
    align-items: stretch;
    border-radius: 16px;
  }

  /* 移动端触摸目标 ≥44px */
  .messages-disclosure__actions button {
    flex: 1;
    min-height: 44px;
  }

  .messages-thread-list {
    gap: 0;
    overflow: hidden;
    border: 1px solid rgba(224, 232, 255, 0.88);
    border-radius: 18px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgba(76, 103, 172, 0.08);
  }

  /* 整列连成一体，卡片拆成列表项，只留分隔线；左侧状态色条保留，状态色到小屏也别丢 */
  .messages-thread {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    grid-template-areas:
      "avatar main meta"
      "avatar main status";
    align-items: center;
    gap: 2px 10px;
    min-height: 74px;
    padding: 12px 12px 12px 10px;
    border: 0;
    border-bottom: 1px solid rgba(226, 232, 240, 0.8);
    border-radius: 0;
    box-shadow: none;
  }

  .messages-thread:last-child {
    border-bottom: 0;
  }

  /* 小屏不抬起也不加阴影：整列已经是一个整体，抬起一行会把它从列表里摘出去 */
  .messages-thread:hover,
  .messages-thread:focus-visible {
    transform: none;
    box-shadow: none;
  }

  .messages-thread__avatar {
    grid-area: avatar;
    align-self: center;
  }

  .messages-thread__main {
    grid-area: main;
    align-self: center;
    gap: 4px;
  }

  .messages-thread__main strong {
    font-size: 15px;
    line-height: 20px;
  }

  /* 小屏只留标题 + 最新动静：编号与模式挤进来会把标题压成一两个词 */
  .messages-thread__sub {
    display: none;
  }

  .messages-thread__desc {
    font-size: 13px;
    line-height: 18px;
  }

  .messages-thread__meta {
    grid-area: meta;
    align-self: start;
    /* 时间那格最长是「12/31 23:59 · 平台」这种串，仍会压到标题列，小屏给它封顶，
       长了就走省略号。这里写死 px 而不是百分比：百分比 max-width
       与 auto 列的宽度互相依赖，会让列宽算错。 */
    min-width: 0;
    max-width: 96px;
    padding-left: 0;
    border-left: 0;
  }

  .messages-thread__meta span {
    display: none;
  }

  .messages-thread__meta time {
    font-size: 12px;
    line-height: 1.2;
  }

  .messages-thread__status {
    grid-area: status;
    align-self: end;
    justify-self: end;
    width: auto;
    max-width: 100%;
    padding: 2px 8px;
    font-size: 10px;
    line-height: 1.4;
  }

  .messages-thread__action {
    display: none;
  }
}

/* 桌面端：搜索框与「会话列表」标题同排——标题 | 搜索 | 工具条。
   宽度不够时工具条换到下一行，保证搜索框仍有可用宽度。
   放在样式表末尾，避免被上方的基础规则（.messages-panel__header 的 display: flex）覆盖 */
@media (min-width: 901px) {
  .messages-panel {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    column-gap: 12px;
    row-gap: 12px;
  }

  /* 拆掉 header 自身的盒子，让标题与工具条直接参与上面的弹性布局 */
  .messages-panel__header {
    display: contents;
  }

  .messages-panel__header > div:first-child {
    order: 1;
  }

  .messages-search-bar {
    order: 2;
    flex: 1 1 260px;
    max-width: 480px;
    margin-bottom: 0;
  }

  .messages-panel__tools {
    order: 3;
    margin-left: auto;
  }

  .messages-state,
  .messages-empty,
  .messages-thread-list {
    order: 4;
    flex: 0 0 100%;
  }

  /* 待我确认的申请排在会话列表之上（同一 order，靠 DOM 顺序） */
  .messages-disclosure-panel {
    order: 4;
    flex: 0 0 100%;
  }
}
</style>
