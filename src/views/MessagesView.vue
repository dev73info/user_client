<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Refresh, RefreshLeft, Search, WarningFilled } from '@element-plus/icons-vue'

import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
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
  sortTime: number
}

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()

// 本页被三个入口共用：用户工作台、开发者工作台、独立 /messages。
// 开发者工作台模式下骨架与其余菜单页完全一致——顶部读数条带页面级刷新、卡片头只留标题与
// 实时状态、搜索与筛选同处一行、列表行走 .dev-stack-item。门户模式保持原来的版式不动，
// 两套结构各自渲染，不再用一段 .user-workbench--dev 覆盖把门户的 DOM「近似」成开发者外观。
const isDevWorkbench = computed(() => route.matched.some((record) => Boolean(record.meta.devArea)))

const loading = ref(false)
const conversations = ref<RequirementConversation[]>([])
const requirements = ref<RequirementItem[]>([])
const activeFilter = ref<MessageFilter>('all')
const searchKeyword = ref('')
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
    sortTime: parseTime(item.updated_at),
  }
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

/** 工具栏右侧的「筛选出 N / M 条」只在搜索或筛选生效时出现，与其余菜单页同一口径 */
const hasActiveThreadFilters = computed(
  () => searchKeyword.value.trim() !== '' || activeFilter.value !== 'all',
)

/** 行内状态胶囊取统一层的配色档：待处理=金、进行中=蓝、已结清=青、已关闭=中性灰 */
function toneChipClass(tone: ThreadTone) {
  if (tone === 'attention') {
    return 'dev-chip--warm'
  }
  if (tone === 'done') {
    return 'dev-chip--cyan'
  }
  if (tone === 'closed') {
    return 'dev-chip--muted'
  }
  return ''
}

/** 实时同步状态胶囊：已连接或连接中=青，重连中=金，未连接=中性灰 */
const realtimeChipClass = computed(() => {
  if (realtimeStatus.value === 'connected' || realtimeStatus.value === 'connecting') {
    return 'dev-chip--cyan'
  }
  if (realtimeStatus.value === 'error') {
    return 'dev-chip--warm'
  }
  return 'dev-chip--muted'
})

/** 用户工作台侧的行内状态徽标（.wb-badge）：与上面的 dev-chip 档位一一对应，浅底 + 深字 */
function toneBadgeClass(tone: ThreadTone) {
  if (tone === 'attention') {
    return 'wb-badge wb-badge--warning'
  }
  if (tone === 'done') {
    return 'wb-badge wb-badge--success'
  }
  if (tone === 'closed') {
    return 'wb-badge'
  }
  return 'wb-badge wb-badge--accent'
}

/** 用户工作台侧的实时同步状态徽标：已连接或连接中=绿，重连中=红，未连接=中性灰 */
const realtimeBadgeClass = computed(() => {
  if (realtimeStatus.value === 'connected' || realtimeStatus.value === 'connecting') {
    return 'wb-badge--success'
  }
  if (realtimeStatus.value === 'error') {
    return 'wb-badge--danger'
  }
  return ''
})

function resetThreadFilters() {
  searchKeyword.value = ''
  activeFilter.value = 'all'
}

function showThread(item: MessageThread) {
  activeRequirementId.value = item.requirementId
  activeTitle.value = item.title
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
  <main :class="isDevWorkbench ? 'dev-page' : 'page-shell custom-page-shell profile-page messages-page'">
    <!-- 顶部读数条：两侧都是「一条读数横条」，只是各自落在自己的统一层上
         （开发者侧 .dev-meta-strip / 用户工作台侧 .wb-strip），读数在左、页面级刷新固定在最右侧 __action 槽。
         刷新在整个页面只留一个入口，卡片头不再重复给一颗。 -->
    <div v-if="isDevWorkbench && !activeRequirementId" class="dev-meta-strip" aria-label="消息概览">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已开启会话</span>
        <span class="dev-meta-strip__value">{{ activeConversations.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">待同步会话</span>
        <span class="dev-meta-strip__value">{{ pendingThreads.length }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">近 7 天更新</span>
        <span class="dev-meta-strip__value">{{ recentConversationCount }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新消息" title="刷新消息" :loading="loading"
          @click="loadMessages(true)">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </div>

    <section v-else-if="!activeRequirementId" class="wb-strip" aria-label="消息概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">已开启会话</span>
        <span class="wb-strip__value">{{ activeConversations.length }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">待同步会话</span>
        <span class="wb-strip__value">{{ pendingThreads.length }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">近 7 天更新</span>
        <span class="wb-strip__value">{{ recentConversationCount }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <el-button class="wb-toolbar__icon-btn" aria-label="刷新消息" title="刷新消息" :loading="loading"
          @click="loadMessages(true)">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </section>

    <RequirementConversationModal v-if="activeRequirementId" display-mode="inline" :visible="true" :token="auth.token"
      :current-username="auth.username" :requirement-id="activeRequirementId" :title="activeTitle"
      @updated="applyConversationDetail" @close="closeConversation" />

    <!-- 开发者工作台：提示条 + 内容卡，与其余菜单页同一形态（读数条 → 提示条 → 内容卡） -->
    <template v-else-if="isDevWorkbench">
      <div v-for="item in pendingHistoryVotes" :key="`history-vote-${item.id}`" class="dev-notice">
        <span class="dev-notice__icon">
          <el-icon>
            <WarningFilled />
          </el-icon>
        </span>
        <div class="dev-notice__copy">
          <strong>{{ item.requirement_title || item.requirement_id }}</strong>
          <p>
            {{ item.requirement_id }} · 前任开发者 {{ item.previous_developer }}；现任开发者 {{ item.current_developer }}
            申请查看前任开发者 {{ item.previous_developer }} 负责期间的沟通记录。你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
          </p>
        </div>
        <div class="dev-notice__action">
          <button class="dev-btn dev-btn--ghost" type="button" :disabled="historyVotingId !== null"
            @click="respondHistoryDisclosure(item, 'rejected')">
            拒绝
          </button>
          <button class="dev-btn dev-btn--primary" type="button" :disabled="historyVotingId !== null"
            @click="respondHistoryDisclosure(item, 'approved')">
            同意公开
          </button>
        </div>
      </div>

      <section class="dev-surface-card">
        <div class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">会话列表</h3>
            <p class="dev-section-desc">按需求逐条沟通，搜索与筛选即时生效。</p>
          </div>
          <div class="dev-card-head__actions">
            <span class="dev-chip" :class="realtimeChipClass" :title="realtimeError">{{ realtimeStatusLabel }}</span>
          </div>
        </div>

        <div class="dev-toolbar">
          <el-select v-model="activeFilter" class="dev-toolbar__field" aria-label="消息筛选">
            <el-option label="全部" value="all" />
            <el-option label="已开启" value="active" />
            <el-option label="待同步" value="pending" />
          </el-select>
          <el-input v-model="searchKeyword" clearable class="dev-toolbar__search" placeholder="搜索需求编号、标题、对方或消息"
            aria-label="搜索消息">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
          <div class="dev-toolbar__actions">
            <span v-if="hasActiveThreadFilters" class="dev-toolbar__hint">
              筛选出 {{ filteredThreads.length }} / {{ allThreads.length }} 条
            </span>
            <el-button class="dev-toolbar__ghost" @click="resetThreadFilters">
              <el-icon>
                <RefreshLeft />
              </el-icon>
              <span>重置</span>
            </el-button>
          </div>
        </div>

        <p v-if="loading" class="dev-empty-state">消息加载中…</p>

        <div v-else-if="filteredThreads.length === 0" class="dev-empty-state">
          <strong class="dev-messages__empty-title">{{ emptyTitle() }}</strong>
          <p class="dev-messages__empty-desc">{{ emptyDescription() }}</p>
          <div v-if="hasActiveThreadFilters" class="dev-list-actions dev-messages__empty-actions">
            <button class="dev-btn dev-btn--ghost" type="button" @click="resetThreadFilters">清空筛选</button>
          </div>
        </div>

        <ul v-else class="dev-stack-list">
          <li v-for="item in filteredThreads" :key="item.key" class="dev-stack-item dev-messages__thread"
            :class="{ 'dev-messages__thread--pending': item.kind === 'pending' }" role="button" tabindex="0"
            @click="openThread(item)" @keydown.enter.prevent="openThread(item)">
            <div class="dev-messages__thread-main">
              <div class="dev-messages__thread-head">
                <strong class="dev-stack-item__title dev-messages__thread-title">{{ item.title }}</strong>
                <span class="dev-chip" :class="toneChipClass(item.tone)">{{ item.statusLabel }}</span>
              </div>
              <div class="dev-stack-item__meta dev-messages__thread-sub">
                {{ item.requirementId }} · {{ item.modeLabel }}
              </div>
              <p class="dev-messages__thread-desc">{{ item.description }}</p>
            </div>
            <div class="dev-messages__thread-side">
              <span>{{ item.partnerLabel }}</span>
              <time>{{ item.lastLabel }}</time>
            </div>
            <span class="dev-btn dev-btn--primary dev-messages__thread-action">{{ item.actionLabel }}</span>
          </li>
        </ul>
      </section>
    </template>

    <section v-else class="wallet-section messages-panel">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">会话列表</h3>
          <p class="wb-card-head__desc">按需求逐条沟通，搜索与筛选即时生效。</p>
        </div>
        <div class="wb-card-head__actions">
          <span v-if="auth.token" class="wb-badge" :class="realtimeBadgeClass" :title="realtimeError">
            {{ realtimeStatusLabel }}
          </span>
        </div>
      </div>

      <div class="wb-toolbar">
        <el-select v-model="activeFilter" class="wb-toolbar__field" aria-label="消息筛选">
          <el-option label="全部" value="all" />
          <el-option label="已开启" value="active" />
          <el-option label="待同步" value="pending" />
        </el-select>
        <el-input v-model="searchKeyword" clearable class="wb-toolbar__search"
          placeholder="搜索需求标题、编号、对方或消息" aria-label="搜索消息">
          <template #prefix>
            <el-icon>
              <Search />
            </el-icon>
          </template>
        </el-input>
        <div class="wb-toolbar__actions">
          <span v-if="hasActiveThreadFilters" class="wb-toolbar__hint">
            筛选出 {{ filteredThreads.length }} / {{ allThreads.length }} 条
          </span>
          <el-button v-if="hasActiveThreadFilters" class="wb-toolbar__ghost" @click="resetThreadFilters">
            <el-icon>
              <RefreshLeft />
            </el-icon>
            <span>重置</span>
          </el-button>
        </div>
      </div>

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
            <el-button class="wb-toolbar__ghost" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'approved')">
              同意公开
            </el-button>
            <el-button class="wb-toolbar__ghost" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'rejected')">
              拒绝
            </el-button>
          </div>
        </article>
      </section>

      <p v-if="loading" class="wb-empty" role="status">消息加载中…</p>
      <div v-else-if="filteredThreads.length === 0 && pendingHistoryVotes.length === 0" class="wb-empty">
        <span class="wb-empty__title">{{ emptyTitle() }}</span>
        {{ emptyDescription() }}
        <div v-if="hasActiveThreadFilters" class="wb-empty__actions">
          <el-button class="wb-toolbar__ghost" @click="resetThreadFilters">
            <el-icon>
              <RefreshLeft />
            </el-icon>
            <span>清除筛选</span>
          </el-button>
        </div>
      </div>
      <ul v-else class="wb-list" aria-label="会话列表">
        <li v-for="item in filteredThreads" :key="item.key" class="wb-item wb-item--clickable messages-thread-row"
          role="button" tabindex="0" @click="openThread(item)" @keydown.enter.prevent="openThread(item)">
          <div class="wb-item__main">
            <strong class="wb-item__title">{{ item.title }}</strong>
            <span class="wb-item__meta">{{ item.requirementId }} · {{ item.modeLabel }}</span>
            <span class="wb-item__meta">{{ item.description }}</span>
          </div>
          <div class="wb-item__side">
            <span :class="toneBadgeClass(item.tone)">{{ item.statusLabel }}</span>
            <span class="wb-item__meta">{{ item.partnerLabel }} · {{ item.lastLabel }}</span>
            <el-button class="wb-toolbar__primary" @click.stop="openThread(item)">
              {{ item.actionLabel }}
            </el-button>
          </div>
        </li>
      </ul>
    </section>

  </main>
</template>

<style scoped>
/* 版式全部走统一层，本页不再自带一套：
   - 用户工作台侧用 portal-workbench.css 的 .wb-*（读数条 / 卡头 / 工具栏 / 列表 / 空态 / 徽标），
     与「我的需求」「我的合同」「我的收藏」等页同一套结构与配色；
   - 开发者工作台侧用 dev-base.css 的 .dev-*（读数条 → 提示条 → 内容卡 → 工具栏 → .dev-stack-list）。
   只剩统一层里没有的两件事留在本页：待我确认的历史沟通公开申请提示条（.messages-disclosure*），
   以及开发者侧会话行的三列排布（.dev-messages__thread*，见文件末尾）。 */

/* 待我确认的历史沟通公开申请：会话列表上方一条待办，配色取统一层的「提醒」档。
   这一页两侧共用同一个提示条，因此颜色取的是**两侧都定义**的令牌：
   --dev-* 与 --wb-* 挂在 :root 上，而 --profile-* 只挂在 .profile-page 内，
   开发者工作台那一支的根元素是 .dev-page，读不到 --profile-*，
   原来靠 var(--profile-warning-soft, rgba(...)) 兜底——兜底值本身就是裸 rgba，
   等于同一块提示条在两侧落成两支金色。统一改挂 --dev-gold，两侧同一支色。 */
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
  border: 1px solid color-mix(in srgb, var(--dev-gold) 32%, transparent);
  border-radius: var(--wb-radius-item);
  background: color-mix(in srgb, var(--dev-gold) 10%, transparent);
}

.messages-disclosure__main {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.messages-disclosure__main strong {
  color: var(--dev-ink);
  font-size: 14px;
}

.messages-disclosure__main small {
  color: var(--dev-gold);
  font-size: 12px;
}

.messages-disclosure__main p {
  margin: 0;
  color: var(--dev-muted);
  font-size: 12.5px;
  line-height: 1.6;
}

.messages-disclosure__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

@media (max-width: 640px) {
  .messages-disclosure {
    flex-direction: column;
    align-items: stretch;
  }

  /* 触屏档：两个动作平分整行，触摸目标 ≥44px */
  .messages-disclosure__actions .el-button {
    flex: 1;
    min-height: 44px;
  }
}

/* ===== 开发者工作台模式的会话行 =====
   本页三个入口共用，开发者工作台那一支的骨架、工具栏、列表与空态直接用 dev-base.css 的 .dev-*
   类名（读数条 → 提示条 → 内容卡 → 工具栏 → .dev-stack-list/.dev-stack-item），不再维护一份
   「近似」统一层的覆盖。下面只留会话行特有、统一层没有的两件事：整行可点，以及行内三列排布。 */
.dev-messages__thread {
  align-items: center;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dev-messages__thread:hover,
.dev-messages__thread:focus-visible {
  border-color: var(--wb-accent-line);
  box-shadow: 0 12px 26px color-mix(in srgb, var(--dev-ink) 10%, transparent);
}

/* 整行是一个按钮（键盘也能打开会话），焦点环不能只靠 hover 才看得见 */
.dev-messages__thread:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--wb-accent) 50%, transparent);
  outline-offset: 2px;
}

/* 会话待开启（本地还没拿到会话记录）：整行铺一层金，与统一层「金额与需要留意的提示」同一支 */
.dev-messages__thread--pending {
  background: color-mix(in srgb, var(--dev-gold) 6%, transparent);
}

.dev-messages__thread-main {
  flex: 1 1 auto;
  min-width: 0;
}

/* 标题与状态胶囊同一行：标题让位给胶囊，过长走省略号（min-width: 0 是 flex 里省略号生效的前提） */
.dev-messages__thread-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dev-messages__thread-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-messages__thread-sub {
  font-variant-numeric: tabular-nums;
}

/* 最新消息只留一行：长短不一会让整列行高参差，对不齐比截断更难扫 */
.dev-messages__thread-desc {
  margin: 6px 0 0;
  overflow: hidden;
  color: var(--dev-muted);
  font-size: 13px;
  line-height: 1.6;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 行尾：对方与时间右对齐，宽度固定成 132px 这一档，行与行的对齐线才齐 */
.dev-messages__thread-side {
  display: grid;
  align-content: center;
  flex: 0 0 auto;
  gap: 4px;
  min-width: 132px;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.5;
  text-align: right;
}

.dev-messages__thread-side time {
  font-variant-numeric: tabular-nums;
}

/* 行内主操作：高度与圆角由 .dev-stack-item .dev-btn 的 32px 档给，这里只留与行尾的间距 */
.dev-messages__thread-action {
  flex: 0 0 auto;
  margin-left: 4px;
}

.dev-messages__empty-title {
  display: block;
  color: var(--dev-ink);
  font-size: 15px;
}

.dev-messages__empty-desc {
  margin: 6px 0 0;
  color: var(--dev-muted);
}

.dev-messages__empty-actions {
  justify-content: center;
  margin-top: 14px;
}
</style>
