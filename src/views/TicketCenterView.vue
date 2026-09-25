<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
// 顶部读数条的刷新按钮图标 + 工具栏「搜索 / 重置」与卡片头「提交新工单」的图标（与其余开发者菜单页同一套）
import { Plus, Refresh, RefreshLeft, Search } from '@element-plus/icons-vue'

import {
  closeTicket,
  createTicket,
  getTicketDetail,
  listTickets,
  replyTicket,
  type CreateTicketPayload,
  type TicketDetail,
  type TicketItem,
  type TicketPriority,
  type TicketStatus,
} from '@/api/tickets'
import { useToast } from '@/composables/useToast'
import { LIST_PAGE_SIZES, useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loading = ref(false)
const detailLoading = ref(false)
const creating = ref(false)
const replying = ref(false)
const closing = ref(false)
const tickets = ref<TicketItem[]>([])
const selectedTicketId = ref('')
const currentDetail = ref<TicketDetail | null>(null)
const newSubject = ref('')
const newCategory = ref('')
const newPriority = ref<TicketPriority>('normal')
const newContent = ref('')
const replyContent = ref('')
const composeOpen = ref(false)
const { showToast } = useToast()

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: '低优先级' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

const selectedTicket = computed(() => tickets.value.find((item) => item.ticket_id === selectedTicketId.value) ?? null)
const ticketStats = computed(() => ({
  total: tickets.value.length,
  pending: tickets.value.filter((item) => item.status === 'open' || item.status === 'processing').length,
  resolved: tickets.value.filter((item) => item.status === 'resolved' || item.status === 'closed').length,
}))

// 待处理/处理中 置顶，已解决/已关闭 靠后；同状态内按更新时间倒序
const sortedTickets = computed(() => {
  const rank: Record<TicketStatus, number> = { open: 0, processing: 1, resolved: 2, closed: 3 }
  return [...tickets.value].sort((a, b) => {
    const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (diff !== 0) return diff
    return new Date(b.updated_at ?? '').getTime() - new Date(a.updated_at ?? '').getTime()
  })
})

// 已关闭/已解决 视为“可收缩”，精简展示
function isCollapsedTicket(status: TicketStatus) {
  return status === 'closed' || status === 'resolved'
}

/* === 开发者工作台下的渲染分支 ===
   工单中心是两个工作台共用的一页：用户工作台的入口是 workbench-tickets（门户体系），
   开发者工作台的入口是 dev-tickets（路由带 devArea，见 router/dev.ts）。
   与消息中心同一套做法——页面自己按路由判断当前属于哪一侧，样式分别落到两套令牌上。
   门户那一侧的版式原样保留（样式都挂在 .portal-page 下），开发者这一侧走 dev-* 统一层。 */
const route = useRoute()
const isDevWorkbench = computed(() => route.matched.some((record) => Boolean(record.meta.devArea)))

/* 开发者侧的工具栏（搜索 / 状态 / 优先级）只过滤本地已加载的工单，不额外打接口；
   刷新复用列表加载函数。 */
const searchKeyword = ref('')
const statusFilter = ref<'all' | TicketStatus>('all')
const priorityFilter = ref<'all' | TicketPriority>('all')

const statusOptions: Array<{ value: 'all' | TicketStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

const priorityFilterOptions: Array<{ value: 'all' | TicketPriority; label: string }> = [
  { value: 'all', label: '全部优先级' },
  ...priorityOptions.map((option) => ({ value: option.value, label: option.label })),
]

const visibleTickets = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return sortedTickets.value.filter((ticket) => {
    if (statusFilter.value !== 'all' && ticket.status !== statusFilter.value) {
      return false
    }
    if (priorityFilter.value !== 'all' && ticket.priority !== priorityFilter.value) {
      return false
    }
    if (!keyword) {
      return true
    }
    return [ticket.subject, ticket.ticket_id, ticket.category ?? ''].some((field) =>
      field.toLowerCase().includes(keyword),
    )
  })
})

const hasActiveFilter = computed(
  () =>
    statusFilter.value !== 'all' ||
    priorityFilter.value !== 'all' ||
    searchKeyword.value.trim() !== '',
)

/* 分页与其余菜单页同构（资源项目、需求大厅、团队资源、版本列表都带表尾分页器）。
   本页工单一次取回全部、筛选在前端做，所以这里是客户端切片，不走服务端页码。 */
const { page, pageSize, total: filteredTotal, paged: pagedTickets } = useClientPagination(visibleTickets)

/* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
watch([searchKeyword, statusFilter, priorityFilter], () => {
  page.value = 1
})

function resetFilters() {
  searchKeyword.value = ''
  statusFilter.value = 'all'
  priorityFilter.value = 'all'
}

function formatTime(value?: string | null) {
  if (!value) {
    return '暂未更新'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatStatus(status: TicketStatus) {
  const mapping: Record<TicketStatus, string> = {
    open: '待处理',
    processing: '处理中',
    resolved: '已解决',
    closed: '已关闭',
  }
  return mapping[status]
}

/* 开发者侧的状态标签走统一层的胶囊（.dev-chip 及其变体），
   与需求大厅、我的接单的状态标签同一套；用户工作台侧走 .wb-badge（浅底 + 深字）。 */
function statusChipClass(status: TicketStatus) {
  if (status === 'open') {
    return 'dev-chip dev-chip--warm'
  }
  if (status === 'resolved') {
    return 'dev-chip dev-chip--cyan'
  }
  if (status === 'closed') {
    return 'dev-chip dev-chip--muted'
  }
  return 'dev-chip'
}

/* 客服回复的来源徽标：两侧都取该侧「提示」色（开发者侧是金 .dev-chip--warm、
   门户侧是琥珀 .wb-badge--warning），与工单状态标签同一套颜色来源，
   不再像原来那样自绘一枚浅黄徽标。 */
const officialBadgeClass = computed(() =>
  isDevWorkbench.value ? 'dev-chip dev-chip--warm' : 'wb-badge wb-badge--warning',
)

/* 用户工作台侧的状态徽标：待处理、处理中、已解决各自取一档状态色，已关闭是终态走中性档。 */
function statusBadgeClass(status: TicketStatus) {
  if (status === 'open') {
    return 'wb-badge wb-badge--warning'
  }
  if (status === 'processing') {
    return 'wb-badge wb-badge--accent'
  }
  if (status === 'resolved') {
    return 'wb-badge wb-badge--success'
  }
  return 'wb-badge'
}

function formatPriority(priority: TicketPriority) {
  const mapping: Record<TicketPriority, string> = {
    low: '低',
    normal: '普通',
    high: '高',
    urgent: '紧急',
  }
  return mapping[priority]
}

function messageBadgeLabel(sender: string, role: string) {
  if (sender === auth.username) {
    return '自己'
  }
  if (role === 'super_admin') {
    return '官方管理员'
  }
  if (role === 'dev') {
    return '官方开发者'
  }
  return '官方回复'
}

function resetCreateForm() {
  newSubject.value = ''
  newCategory.value = ''
  newPriority.value = 'normal'
  newContent.value = ''
}

function openCompose() {
  composeOpen.value = true
}

async function loadDetail(ticketId: string) {
  if (!auth.token || !ticketId) {
    currentDetail.value = null
    return
  }

  detailLoading.value = true
  try {
    currentDetail.value = await getTicketDetail(auth.token, ticketId)
    selectedTicketId.value = ticketId
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载工单详情失败', 'error')
  } finally {
    detailLoading.value = false
  }
}

async function loadTicketsAndKeepSelection(preferredTicketId?: string) {
  if (!auth.token) {
    tickets.value = []
    currentDetail.value = null
    return
  }

  loading.value = true
  try {
    const items = await listTickets(auth.token)
    tickets.value = items
    // 默认选中排序后的第一张（优先展示待处理/处理中）
    const targetId =
      preferredTicketId || selectedTicketId.value || sortedTickets.value[0]?.ticket_id || ''
    if (targetId) {
      await loadDetail(targetId)
    } else {
      selectedTicketId.value = ''
      currentDetail.value = null
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '加载工单失败', 'error')
  } finally {
    loading.value = false
  }
}

async function submitCreate() {
  if (!auth.token) {
    showToast('请先登录', 'error')
    return
  }

  const trimmedSubject = newSubject.value.trim()
  const trimmedContent = newContent.value.trim()

  if (trimmedSubject.length < 2) {
    showToast('工单标题至少需要 2 个字符', 'warning')
    return
  }

  if (trimmedContent.length < 5) {
    showToast('问题描述至少需要 5 个字符', 'warning')
    return
  }

  const payload: CreateTicketPayload = {
    subject: trimmedSubject,
    category: newCategory.value.trim() || undefined,
    priority: newPriority.value,
    content: trimmedContent,
  }

  creating.value = true
  try {
    const created = await createTicket(auth.token, payload)
    resetCreateForm()
    composeOpen.value = false
    showToast('工单已创建', 'success')
    await loadTicketsAndKeepSelection(created.ticket_id)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '创建工单失败', 'error')
  } finally {
    creating.value = false
  }
}

async function submitReply() {
  if (!auth.token || !selectedTicketId.value) {
    return
  }

  replying.value = true
  try {
    currentDetail.value = await replyTicket(auth.token, selectedTicketId.value, {
      content: replyContent.value.trim(),
    })
    replyContent.value = ''
    showToast('回复已发送', 'success')
    await loadTicketsAndKeepSelection(selectedTicketId.value)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '回复工单失败', 'error')
  } finally {
    replying.value = false
  }
}

async function submitClose() {
  if (!auth.token || !selectedTicketId.value) {
    return
  }

  closing.value = true
  try {
    await closeTicket(auth.token, selectedTicketId.value)
    showToast('工单已关闭', 'success')
    await loadTicketsAndKeepSelection(selectedTicketId.value)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '关闭工单失败', 'error')
  } finally {
    closing.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  await loadTicketsAndKeepSelection()
})
</script>

<template>
  <main :class="isDevWorkbench ? 'dev-page ticket-page-shell' : 'page-shell custom-page-shell profile-page ticket-page-shell'">
    <!-- 顶部卡片：两侧都是「一条读数横条」，只是各自落在自己的统一层上
         （开发者侧 .dev-meta-strip / 用户工作台侧 .wb-strip），刷新固定在 __action 槽。 -->
    <section v-if="isDevWorkbench" class="dev-meta-strip" aria-label="工单概览">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">全部工单</span>
        <span class="dev-meta-strip__value">{{ ticketStats.total }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">处理中</span>
        <span class="dev-meta-strip__value">{{ ticketStats.pending }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">已完成</span>
        <span class="dev-meta-strip__value">{{ ticketStats.resolved }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新工单" :loading="loading"
          @click="loadTicketsAndKeepSelection()">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </section>

    <section v-else class="wb-strip" aria-label="工单概览">
      <div class="wb-strip__item">
        <span class="wb-strip__label">全部工单</span>
        <span class="wb-strip__value">{{ ticketStats.total }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">处理中</span>
        <span class="wb-strip__value">{{ ticketStats.pending }}</span>
      </div>
      <div class="wb-strip__divider" />
      <div class="wb-strip__item">
        <span class="wb-strip__label">已完成</span>
        <span class="wb-strip__value">{{ ticketStats.resolved }}</span>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <el-button class="wb-toolbar__icon-btn" aria-label="刷新工单" :loading="loading"
          @click="loadTicketsAndKeepSelection()">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </section>

    <section class="ticket-main-grid">
      <aside :class="isDevWorkbench ? 'dev-surface-card ticket-list-panel' : 'wallet-section ticket-list-panel'">
        <!-- 卡片头：两侧都是统一层的卡头（标题 + 说明 + 右侧动作），
             开发者侧 .dev-card-head / 用户工作台侧 .wb-card-head。 -->
        <div v-if="isDevWorkbench" class="dev-card-head">
          <div class="dev-card-head__title-block">
            <h3 class="dev-section-title">工单列表</h3>
            <p class="dev-section-desc">按状态与优先级筛选，选中一张工单查看消息记录并继续回复。</p>
          </div>
          <div class="dev-card-head__actions">
            <button class="dev-btn dev-btn--primary" type="button" @click="openCompose">
              <el-icon>
                <Plus />
              </el-icon>
              <span>提交新工单</span>
            </button>
          </div>
        </div>
        <div v-else class="wb-card-head">
          <div class="wb-card-head__title-block">
            <h3 class="wb-card-head__title">工单列表</h3>
            <p class="wb-card-head__desc">按状态与优先级筛选，选中一张工单查看消息记录并继续回复。</p>
          </div>
          <div class="wb-card-head__actions">
            <el-button class="wb-toolbar__primary" @click="openCompose">
              <el-icon>
                <Plus />
              </el-icon>
              <span>提交新工单</span>
            </el-button>
          </div>
        </div>

        <!-- 工具栏：两侧都有，位置一致（卡片内部、卡片头正下方）。
             本页左栏只有 280–420px，一行摆不下「筛选 150 + 筛选 150 + 搜索 340 + 重置」，
             所以挂 --stacked：固定折成两行——第一行「两个筛选 + 右侧重置」，第二行搜索占满。
             段序与宽栏一致，控件规格也还是统一层那一套（dev-base.css / portal-workbench.css），
             原来靠裸 flex-wrap 兜底会折成三行、高 128px，与其它页 36px 的单行工具栏差得远。 -->
        <div v-if="isDevWorkbench" class="dev-toolbar dev-toolbar--stacked">
          <el-select v-model="statusFilter" class="dev-toolbar__field" aria-label="按状态筛选">
            <el-option v-for="option in statusOptions" :key="option.value" :label="option.label"
              :value="option.value" />
          </el-select>
          <el-select v-model="priorityFilter" class="dev-toolbar__field" aria-label="按优先级筛选">
            <el-option v-for="option in priorityFilterOptions" :key="option.value" :label="option.label"
              :value="option.value" />
          </el-select>
          <el-input v-model="searchKeyword" class="dev-toolbar__search" clearable placeholder="搜索工单标题、编号或分类">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
          <div class="dev-toolbar__actions">
            <span v-if="hasActiveFilter" class="dev-toolbar__hint">筛选出 {{ filteredTotal }} 条</span>
            <el-button class="dev-toolbar__ghost" @click="resetFilters">
              <el-icon>
                <RefreshLeft />
              </el-icon>
              <span>重置</span>
            </el-button>
          </div>
        </div>

        <div v-else class="wb-toolbar wb-toolbar--stacked">
          <el-select v-model="statusFilter" class="wb-toolbar__field" aria-label="按状态筛选">
            <el-option v-for="option in statusOptions" :key="option.value" :label="option.label"
              :value="option.value" />
          </el-select>
          <el-select v-model="priorityFilter" class="wb-toolbar__field" aria-label="按优先级筛选">
            <el-option v-for="option in priorityFilterOptions" :key="option.value" :label="option.label"
              :value="option.value" />
          </el-select>
          <el-input v-model="searchKeyword" class="wb-toolbar__search" clearable placeholder="搜索工单标题、编号或分类">
            <template #prefix>
              <el-icon>
                <Search />
              </el-icon>
            </template>
          </el-input>
          <div class="wb-toolbar__actions">
            <span v-if="hasActiveFilter" class="wb-toolbar__hint">筛选出 {{ filteredTotal }} 条</span>
            <el-button class="wb-toolbar__ghost" @click="resetFilters">
              <el-icon>
                <RefreshLeft />
              </el-icon>
              <span>重置</span>
            </el-button>
          </div>
        </div>

        <div v-if="!loading && visibleTickets.length === 0"
          :class="isDevWorkbench ? 'ticket-empty-state dev-empty-state' : 'wb-empty'">
          <p v-if="hasActiveFilter">当前筛选下没有工单，换个条件或点「重置」再看看。</p>
          <p v-else>提交第一张工单后，这里会显示处理状态和最近回复。</p>
        </div>

        <!-- 列表行：开发者侧复用统一层的 .dev-stack-item（内嵌块：冷白底 + --dev-line 描边 + 12px 圆角），
             行内状态标签走 .dev-chip 胶囊；用户工作台侧走 .wb-item（卡片式行）+ .wb-badge。
             两侧各自挂在只有自己会命中的类名上，本页 scoped 样式不再跨层覆盖。 -->
        <button v-for="ticket in pagedTickets" :key="ticket.ticket_id" type="button"
          :class="isDevWorkbench
            ? ['ticket-list-item', 'dev-stack-item', { active: selectedTicketId === ticket.ticket_id, 'is-collapsed': isCollapsedTicket(ticket.status) }]
            : ['wb-item', 'wb-item--clickable', 'ticket-list-row', { 'wb-item--active': selectedTicketId === ticket.ticket_id }]"
          @click="loadDetail(ticket.ticket_id)">
          <div v-if="isDevWorkbench" class="ticket-list-item__body">
            <div class="ticket-list-item__top">
              <strong class="ticket-list-item__subject">{{ ticket.subject }}</strong>
              <span :class="statusChipClass(ticket.status)">{{
                formatStatus(ticket.status) }}</span>
            </div>
            <p v-if="!isCollapsedTicket(ticket.status)" class="ticket-list-item__summary">{{
              ticket.category || '未分类' }} · 优先级 {{ formatPriority(ticket.priority) }}</p>
            <div class="ticket-list-item__meta">
              <span class="ticket-list-item__ticket-id" :title="ticket.ticket_id">{{ ticket.ticket_id }}</span>
              <time class="ticket-list-item__time">{{ formatTime(ticket.updated_at) }}</time>
            </div>
          </div>
          <template v-else>
            <div class="wb-item__main">
              <strong class="wb-item__title">{{ ticket.subject }}</strong>
              <span v-if="!isCollapsedTicket(ticket.status)" class="wb-item__meta">
                {{ ticket.category || '未分类' }} · 优先级 {{ formatPriority(ticket.priority) }}
              </span>
              <span class="wb-item__meta">{{ ticket.ticket_id }} · {{ formatTime(ticket.updated_at) }}</span>
            </div>
            <div class="wb-item__side">
              <span :class="statusBadgeClass(ticket.status)">{{ formatStatus(ticket.status) }}</span>
            </div>
          </template>
        </button>

        <!-- 表尾分页器：与资源项目、需求大厅、团队资源同一枚，两侧都挂在各自的统一层上。 -->
        <div v-if="isDevWorkbench" class="dev-pager">
          <div class="dev-pager__count">
            <span>共 {{ filteredTotal }} 条</span>
            <el-select v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
              <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </el-select>
          </div>
          <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" layout="prev, pager, next" background aria-label="工单列表分页" />
        </div>

        <div v-else class="wb-pager">
          <div class="wb-pager__count">
            <span>共 {{ filteredTotal }} 条</span>
            <el-select v-model="pageSize" aria-label="每页条数" class="wb-pager__size">
              <el-option v-for="size in LIST_PAGE_SIZES" :key="size" :label="`${size} 条/页`" :value="size" />
            </el-select>
          </div>
          <el-pagination v-model:current-page="page" :page-size="pageSize" :total="filteredTotal"
            :pager-count="5" layout="prev, pager, next" background aria-label="工单列表分页" />
        </div>
      </aside>

      <section :class="isDevWorkbench ? 'dev-surface-card ticket-detail-panel' : 'wallet-section ticket-detail-panel'">
        <div v-if="selectedTicket && currentDetail" class="ticket-detail-shell">
          <header class="ticket-detail-header">
            <div class="ticket-detail-header__main">
              <h2>{{ selectedTicket.subject }}</h2>
              <p class="ticket-detail-header__meta">
                <span class="ticket-detail-header__ticket-id">{{ selectedTicket.ticket_id }}</span>
                <span>·</span>
                {{ selectedTicket.category || '未分类' }}
                <span>·</span>
                优先级 {{ formatPriority(selectedTicket.priority) }}
              </p>
            </div>
            <div class="ticket-detail-header__actions">
              <span :class="isDevWorkbench ? statusChipClass(selectedTicket.status) : statusBadgeClass(selectedTicket.status)">{{
                formatStatus(selectedTicket.status) }}</span>
              <button v-if="isDevWorkbench && selectedTicket.status !== 'closed'" class="dev-btn dev-btn--ghost" type="button"
                :disabled="closing" @click="submitClose">
                {{ closing ? '关闭中...' : '关闭工单' }}
              </button>
              <el-button v-else-if="selectedTicket.status !== 'closed'" class="wb-toolbar__ghost" :disabled="closing"
                @click="submitClose">
                {{ closing ? '关闭中...' : '关闭工单' }}
              </el-button>
            </div>
          </header>

          <div v-if="detailLoading" :class="isDevWorkbench ? 'dev-empty-state' : 'wb-empty'">
            <p>正在同步当前工单的最新消息。</p>
          </div>

          <div v-else class="ticket-thread">
            <article v-for="message in currentDetail.messages" :key="message.id" class="ticket-message"
              :class="{ 'is-self': message.sender === auth.username, 'is-official': message.sender !== auth.username }">
              <div v-if="message.sender !== auth.username" class="ticket-message__meta">
                <div class="ticket-message__identity">
                  <span :class="['ticket-message__badge', officialBadgeClass]">
                    {{ messageBadgeLabel(message.sender, message.sender_role) }}
                  </span>
                </div>
              </div>
              <p class="ticket-message__content">{{ message.content }}</p>
              <time class="ticket-message__time">{{ formatTime(message.created_at) }}</time>
            </article>
          </div>

          <div v-if="selectedTicket.status !== 'closed'" class="ticket-reply-box">
            <!-- 回复框同样用 Element 的输入组件与统一层按钮，
                 否则这里会留下第三种输入框（18px 圆角、蓝色 4px 焦点环）与一枚渐变主按钮。 -->
            <el-input v-model="replyContent" type="textarea" :rows="2"
              placeholder="补充新的现象、截图说明或你的确认结果。"
              @keydown.enter.exact.prevent="replyContent.trim() && submitReply()" />
            <el-button v-if="isDevWorkbench" class="dev-toolbar__primary" :loading="replying" @click="submitReply">
              发送回复
            </el-button>
            <el-button v-else class="wb-toolbar__primary" :loading="replying" @click="submitReply">
              发送回复
            </el-button>
          </div>
        </div>

        <!-- 右侧未选中时的空态也走统一层：原来是自己一套居中文案，
             与其它页的虚线空态框不是一个形态。 -->
        <div v-else :class="isDevWorkbench ? 'dev-empty-state' : 'wb-empty'">
          <p>左侧会展示你的全部工单。选中后可以查看消息记录并继续回复。</p>
        </div>
      </section>
    </section>

    <!-- 弹窗会被 Element teleport 到 body，落在两侧工作台的根元素之外，
         所以必须自己挂统一层的弹窗类（开发者侧 dev-dialog、用户工作台侧 wb-dialog），
         否则弹窗里的 Element 主色退回默认蓝，与页面内的按钮不是一个颜色。 -->
    <el-dialog v-model="composeOpen" title="提交新工单" width="720px"
      :class="isDevWorkbench ? 'dev-dialog' : 'wb-dialog'">
      <!-- 表单控件一律用 Element 的输入组件：裸 input / select / textarea 拿不到统一层的
           控件规格（36px 高、10px 圆角）与令牌配色，同一页里会长出两套输入框；
           优先级原先是自绘下拉，改回 el-select，选项文案照旧。 -->
      <el-form class="compose-grid" label-position="top" @submit.prevent>
        <el-form-item label="工单标题">
          <el-input v-model="newSubject" placeholder="例如：尾款支付后资源仍不可见" />
        </el-form-item>
        <el-form-item label="工单分类">
          <el-input v-model="newCategory" placeholder="例如：支付 / 资源 / 账号" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="newPriority" aria-label="优先级">
            <el-option v-for="option in priorityOptions" :key="option.value" :label="option.label"
              :value="option.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="问题描述" class="compose-grid__span">
          <el-input v-model="newContent" type="textarea" :rows="5"
            placeholder="请描述你遇到的问题、已尝试的操作，以及希望得到的处理结果。" />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="compose-actions">
          <el-button v-if="isDevWorkbench" class="dev-toolbar__primary" :loading="creating" @click="submitCreate">
            提交工单
          </el-button>
          <el-button v-else class="wb-toolbar__primary" :loading="creating" @click="submitCreate">
            提交工单
          </el-button>
        </div>
      </template>
    </el-dialog>
  </main>
</template>

<style scoped>
.ticket-page-shell {
  display: grid;
  gap: 16px;
}

/* 工单页是「左列表 + 右详情」的主从两栏：
   面板内边距与圆角交回各自统一层（用户工作台侧 .wallet-section，开发者侧 .dev-surface-card），
   本页不再压成 18px，否则同一形态的卡片在这一页比别页窄一圈。 */
.ticket-list-panel,
.ticket-detail-panel {
  display: flex;
  flex-direction: column;
}

/* 弹窗表单：三列栅格排版留在本页，控件外观全部交给 Element 与统一层令牌 */
.compose-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.compose-grid :deep(.el-form-item) {
  margin-bottom: 0;
}

.compose-grid__span {
  grid-column: 1 / -1;
}

/* 优先级下拉已改回 el-select（见模板），自绘下拉的整套样式一并删掉，
   不要留死代码：它带着自己的 16px 圆角、浅蓝焦点环与四个优先级裸色。 */

.compose-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

/* 弹窗与回复框的主按钮已改用统一层的按钮变体（dev-toolbar__primary / wb-toolbar__primary），
   原来那枚渐变主按钮（#2563eb→#4f8cff）是这一页独有的第二套主色，删掉。 */

.ticket-main-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 22px;
}

.ticket-list-panel {
  display: grid;
  gap: 10px;
  align-content: start;
}

/* 行本身的外观（12px 圆角、16px 18px 内边距、--dev-line 描边、冷白底）由统一层的
   .dev-stack-item / .wb-item 给；本页只补它们没有的两件事：
   行是整块可点的 <button>，以及行内是纵向排布。 */
.ticket-list-item {
  width: 100%;
  text-align: left;
  font: inherit;
  cursor: pointer;
  display: grid;
  gap: 6px;
  overflow: hidden;
}

/* 已关闭/已解决：自动收缩，减少高度并淡显示 */
.ticket-list-item.is-collapsed {
  opacity: 0.6;
}

/* 选中行取统一层的主色（--dev-blue 与门户侧 --wb-accent 同值），
   原来是页面自己的一套亮蓝（rgba(96,165,250,…)）。 */
.ticket-list-item.active {
  border-color: var(--wb-accent-line);
  background: var(--wb-accent-soft);
  box-shadow: 0 0 0 1px var(--wb-accent-line) inset;
}

.ticket-list-item__top,
.ticket-list-item__meta,
.ticket-detail-header,
.ticket-detail-header__actions,
.ticket-message__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.ticket-list-item__top,
.ticket-list-item__meta,
.ticket-detail-header {
  min-width: 0;
}

.ticket-list-item__subject,
.ticket-list-item__summary,
.ticket-list-item__ticket-id,
.ticket-detail-header__main,
.ticket-detail-header__meta,
.ticket-detail-header__ticket-id {
  min-width: 0;
}

.ticket-list-item__subject {
  flex: 1 1 auto;
  overflow-wrap: anywhere;
  font-size: 14px;
}

.ticket-list-item__summary {
  overflow-wrap: anywhere;
  font-size: 12px;
}

.ticket-list-item__meta {
  align-items: center;
}

.ticket-list-item__ticket-id {
  flex: 1 1 auto;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
}

.ticket-list-item__time {
  flex: 0 0 auto;
  text-align: right;
  white-space: nowrap;
}

.ticket-list-item p,
.ticket-detail-header p,
.ticket-message p {
  margin: 0;
  color: var(--dev-muted);
}

.ticket-list-item__meta,
.ticket-message__meta {
  font-size: 13px;
  color: var(--dev-muted);
}

.ticket-detail-header {
  align-items: flex-start;
}

.ticket-detail-header__main {
  flex: 1 1 auto;
}

.ticket-detail-header__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  overflow-wrap: anywhere;
}

.ticket-detail-header__ticket-id {
  overflow-wrap: anywhere;
}

.ticket-detail-header__actions {
  flex: 0 0 auto;
  align-items: flex-start;
}

.ticket-detail-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  flex: 1;
  min-height: 0;
}

.ticket-thread {
  display: grid;
  gap: 14px;
  flex: 1;
  overflow: auto;
  min-height: 0;
  align-content: start;
}

/* 消息气泡：这一页独有的主从详情布局，保留「自己靠右、客服靠左」的做法，
   但配色换成统一层令牌——原来是一支亮蓝（rgba(96,165,250,…)）的渐变与阴影，
   与菜单页的主色（--dev-blue / --wb-accent）不是同一个蓝。 */
.ticket-message {
  padding: 16px;
  border-radius: var(--dev-radius-inner);
  background: var(--dev-surface-strong);
  border: 1px solid var(--dev-line);
  display: grid;
  gap: 10px;
  max-width: min(92%, 760px);
}

.ticket-message.is-self {
  margin-left: auto;
  border-color: var(--wb-accent-line);
  background: var(--wb-accent-soft);
}

.ticket-message.is-official {
  margin-right: auto;
}

.ticket-message__meta {
  align-items: flex-start;
}

.ticket-message__identity {
  display: flex;
  align-items: center;
  min-width: 0;
}

.ticket-message__identity strong {
  overflow-wrap: anywhere;
}

/* 来源徽标（自己 / 官方）的底色与文字改用统一层的状态色类
   （见 senderBadgeClass：开发者侧 dev-chip*、门户侧 wb-badge*），
   这里只剩排版。原来自己写了一套浅蓝 + 浅黄，与统一层的语义色不是同一支。 */
.ticket-message__badge {
  flex: 0 0 auto;
  white-space: nowrap;
}

.ticket-message__content {
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--dev-ink-soft);
}

.ticket-message__time {
  display: block;
  font-size: 12px;
  line-height: 1.4;
  color: var(--dev-muted);
}

.ticket-message.is-self .ticket-message__time {
  text-align: right;
}

.ticket-message.is-official .ticket-message__time {
  text-align: left;
}

/* 回复框：输入控件已换成 el-input（外面那层 .el-textarea 自带统一层的 36px 控件规格
   与令牌配色），这里只管一行排布。 */
.ticket-reply-box {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid var(--dev-line);
  padding-top: 14px;
}

.ticket-reply-box :deep(.el-textarea) {
  flex: 1 1 auto;
  min-width: 0;
}

.ticket-detail-header h2 {
  margin: 0;
  color: var(--dev-ink);
}

/* 用户工作台侧的空态走统一层 .wb-empty，里面的段落自带外边距，这里复位一次 */
.wb-empty p {
  margin: 0;
}

/* 门户侧的行是 <button>：统一层的 .wb-item 只管版面，
   按钮自带的居中与字体要在本页复位，否则标题与读数会居中排 */
.ticket-list-row {
  width: 100%;
  font: inherit;
  text-align: left;
}

@media (max-width: 1080px) {

  .compose-grid,
  .ticket-main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {

  .ticket-list-item__meta,
  .ticket-detail-header,
  .ticket-detail-header__actions {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ticket-list-item__time {
    white-space: normal;
  }

  .ticket-message {
    max-width: 100%;
  }

  .ticket-message__meta,
  .ticket-message__identity {
    flex-wrap: wrap;
  }
}
</style>
