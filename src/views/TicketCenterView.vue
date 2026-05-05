<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppToast from '@/components/AppToast.vue'
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
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
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
const { toastVisible, toastMessage, toastType, showToast, hideToast } = useToast()

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
const pageSignals = computed(() => [
  `全部工单 ${ticketStats.value.total}`,
  `处理中 ${ticketStats.value.pending}`,
  `已完成 ${ticketStats.value.resolved}`,
])

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
    const targetId = preferredTicketId || selectedTicketId.value || items[0]?.ticket_id || ''
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
  <main class="portal-page ticket-page-shell">
    <section class="portal-page__hero">
      <div class="portal-page__hero-copy">
        <p class="portal-page__eyebrow">Ticket Center</p>
        <h1>我的工单</h1>
        <p>这里集中处理售后、协助和问题反馈。你可以发起新工单，也可以持续跟进已有会话，当前页已统一到门户子页的视觉体系。</p>

        <div class="portal-page__signal-list">
          <span v-for="signal in pageSignals" :key="signal" class="portal-page__signal">{{ signal }}</span>
        </div>

        <div class="portal-page__hero-actions">
          <button class="portal-page__primary" type="button" @click="router.push({ name: 'profile' })">个人中心</button>
          <button class="portal-page__secondary" type="button"
            @click="router.push({ name: 'my-custom-resources' })">我的资源</button>
        </div>
      </div>

      <div class="portal-page__hero-visual" aria-hidden="true">
        <div class="portal-page__hero-orbit">
          <div class="portal-page__hero-core">单</div>
          <div class="portal-page__hero-float portal-page__hero-float--one">问</div>
          <div class="portal-page__hero-float portal-page__hero-float--two">答</div>
          <div class="portal-page__hero-float portal-page__hero-float--three">服</div>
          <div class="portal-page__hero-float portal-page__hero-float--four">务</div>
        </div>
      </div>
    </section>

    <section class="portal-page__stats">
      <article class="portal-page__stat-card">
        <strong>{{ ticketStats.total }}</strong>
        <span>全部工单</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ ticketStats.pending }}</strong>
        <span>处理中</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ ticketStats.resolved }}</strong>
        <span>已完成</span>
      </article>
      <article class="portal-page__stat-card">
        <strong>{{ priorityOptions.length }}</strong>
        <span>优先级档位</span>
      </article>
    </section>

    <section class="portal-page__panel ticket-compose-panel">
      <div class="panel-head panel-head--stack">
        <div>
          <h2>提交新工单</h2>
          <p class="lead">建议把现象、时间点、需求号或资源号写清楚，方便后台快速定位。</p>
        </div>
        <button class="refresh-btn" type="button" :disabled="loading || detailLoading"
          @click="loadTicketsAndKeepSelection()">
          {{ loading || detailLoading ? '同步中...' : '刷新工单' }}
        </button>
      </div>

      <div class="compose-grid">
        <label class="field">
          <span>工单标题</span>
          <input v-model="newSubject" type="text" placeholder="例如：尾款支付后资源仍不可见" />
        </label>
        <label class="field">
          <span>工单分类</span>
          <input v-model="newCategory" type="text" placeholder="例如：支付 / 资源 / 账号" />
        </label>
        <label class="field">
          <span>优先级</span>
          <select v-model="newPriority">
            <option v-for="option in priorityOptions" :key="option.value" :value="option.value">{{ option.label }}
            </option>
          </select>
        </label>
        <label class="field field--full">
          <span>问题描述</span>
          <textarea v-model="newContent" rows="5" placeholder="请描述你遇到的问题、已尝试的操作，以及希望得到的处理结果。" />
        </label>
      </div>

      <div class="compose-actions">
        <button class="ticket-primary-btn" type="button" :disabled="creating" @click="submitCreate">
          {{ creating ? '提交中...' : '提交工单' }}
        </button>
      </div>
    </section>

    <section class="ticket-main-grid">
      <aside class="portal-page__panel ticket-list-panel">
        <div class="panel-head">
          <div>
            <h2>工单列表</h2>
            <p class="lead">点击左侧工单查看完整沟通记录。</p>
          </div>
        </div>

        <div v-if="!loading && tickets.length === 0" class="ticket-empty-state">
          <h3>还没有工单</h3>
          <p>提交第一张工单后，这里会显示处理状态和最近回复。</p>
        </div>

        <button v-for="ticket in tickets" :key="ticket.ticket_id" class="ticket-list-item"
          :class="{ active: selectedTicketId === ticket.ticket_id }" type="button"
          @click="loadDetail(ticket.ticket_id)">
          <div class="ticket-list-item__top">
            <strong class="ticket-list-item__subject">{{ ticket.subject }}</strong>
            <span class="ticket-status-pill" :class="`is-${ticket.status}`">{{ formatStatus(ticket.status) }}</span>
          </div>
          <p class="ticket-list-item__summary">{{ ticket.category || '未分类' }} · 优先级 {{ formatPriority(ticket.priority)
          }}</p>
          <div class="ticket-list-item__meta">
            <span class="ticket-list-item__ticket-id">{{ ticket.ticket_id }}</span>
            <time class="ticket-list-item__time">{{ formatTime(ticket.updated_at) }}</time>
          </div>
        </button>
      </aside>

      <section class="portal-page__panel ticket-detail-panel">
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
              <span class="ticket-status-pill" :class="`is-${selectedTicket.status}`">{{
                formatStatus(selectedTicket.status) }}</span>
              <button v-if="selectedTicket.status !== 'closed'" class="ticket-secondary-btn" type="button"
                :disabled="closing" @click="submitClose">
                {{ closing ? '关闭中...' : '关闭工单' }}
              </button>
            </div>
          </header>

          <div v-if="detailLoading" class="ticket-empty-state">
            <h3>会话加载中...</h3>
            <p>正在同步当前工单的最新消息。</p>
          </div>

          <div v-else class="ticket-thread">
            <article v-for="message in currentDetail.messages" :key="message.id" class="ticket-message"
              :class="{ 'is-self': message.sender === auth.username, 'is-official': message.sender !== auth.username }">
              <div class="ticket-message__meta">
                <div class="ticket-message__identity">
                  <span v-if="message.sender !== auth.username" class="ticket-message__badge"
                    :class="message.sender === auth.username ? 'is-self' : 'is-official'">
                    {{ messageBadgeLabel(message.sender, message.sender_role) }}
                  </span>
                </div>
                <span v-if="message.sender === auth.username" class="ticket-message__badge"
                  :class="message.sender === auth.username ? 'is-self' : 'is-official'">
                  {{ messageBadgeLabel(message.sender, message.sender_role) }}
                </span>
              </div>
              <p class="ticket-message__content">{{ message.content }}</p>
              <time class="ticket-message__time">{{ formatTime(message.created_at) }}</time>
            </article>
          </div>

          <div v-if="selectedTicket.status !== 'closed'" class="ticket-reply-box">
            <label class="field field--full">
              <span>继续回复</span>
              <textarea v-model="replyContent" rows="4" placeholder="补充新的现象、截图说明或你的确认结果。" />
            </label>
            <div class="compose-actions">
              <button class="ticket-primary-btn" type="button" :disabled="replying" @click="submitReply">
                {{ replying ? '发送中...' : '发送回复' }}
              </button>
            </div>
          </div>
        </div>

        <div v-else class="ticket-empty-state">
          <h3>请选择一张工单</h3>
          <p>左侧会展示你的全部工单。选中后可以查看消息记录并继续回复。</p>
        </div>
      </section>
    </section>

    <AppToast :visible="toastVisible" :message="toastMessage" :type="toastType" @close="hideToast" />
  </main>
</template>

<style scoped>
.ticket-page-shell {
  display: grid;
  gap: 22px;
}

.ticket-compose-panel,
.ticket-list-panel,
.ticket-detail-panel {
  padding: 24px;
}

.panel-head--stack {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.compose-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 18px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 14px;
  font-weight: 700;
  color: #475569;
}

.field input,
.field select,
.field textarea {
  width: 100%;
  border-radius: 16px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  padding: 12px 14px;
  box-sizing: border-box;
  outline: none;
}

.field input:focus,
.field select:focus,
.field textarea:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.field textarea {
  resize: vertical;
}

.field--full {
  grid-column: 1 / -1;
}

.compose-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.ticket-primary-btn,
.ticket-secondary-btn,
.refresh-btn {
  border: 0;
  font: inherit;
  cursor: pointer;
}

.ticket-primary-btn {
  min-height: 44px;
  padding: 0 18px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
}

.ticket-secondary-btn,
.refresh-btn {
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
}

.ticket-main-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 22px;
}

.ticket-list-panel {
  display: grid;
  gap: 14px;
  align-content: start;
}

.ticket-list-item {
  width: 100%;
  text-align: left;
  border-radius: 18px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  padding: 16px;
  cursor: pointer;
  display: grid;
  gap: 10px;
  overflow: hidden;
}

.ticket-list-item.active {
  border-color: rgba(96, 165, 250, 0.72);
  background: rgba(239, 246, 255, 0.98);
  box-shadow: 0 16px 28px rgba(96, 165, 250, 0.14);
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
}

.ticket-list-item__summary {
  overflow-wrap: anywhere;
}

.ticket-list-item__meta {
  align-items: flex-end;
}

.ticket-list-item__ticket-id {
  flex: 1 1 auto;
  overflow-wrap: anywhere;
}

.ticket-list-item__time {
  flex: 0 0 auto;
  text-align: right;
  white-space: nowrap;
}

.ticket-list-item p,
.ticket-detail-header p,
.ticket-empty-state p,
.ticket-message p {
  margin: 0;
  color: #64748b;
}

.ticket-list-item__meta,
.ticket-message__meta {
  font-size: 13px;
  color: #64748b;
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

.ticket-status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.ticket-status-pill.is-open {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.ticket-status-pill.is-processing {
  background: rgba(254, 249, 195, 0.96);
  color: #a16207;
}

.ticket-status-pill.is-resolved {
  background: rgba(220, 252, 231, 0.92);
  color: #15803d;
}

.ticket-status-pill.is-closed {
  background: rgba(241, 245, 249, 0.96);
  color: #475569;
}

.ticket-detail-shell {
  display: grid;
  gap: 18px;
}

.ticket-thread {
  display: grid;
  gap: 14px;
  max-height: 680px;
  overflow: auto;
}

.ticket-message {
  padding: 16px;
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.96);
  border: 1px solid rgba(198, 210, 236, 0.72);
  display: grid;
  gap: 10px;
  max-width: min(92%, 760px);
}

.ticket-message.is-self {
  margin-left: auto;
  border-color: rgba(96, 165, 250, 0.42);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.98), rgba(219, 234, 254, 0.94));
  box-shadow: 0 14px 30px rgba(96, 165, 250, 0.14);
}

.ticket-message.is-official {
  margin-right: auto;
  border-color: rgba(226, 232, 240, 0.96);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 14px 28px rgba(148, 163, 184, 0.14);
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

.ticket-message__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex: 0 0 auto;
}

.ticket-message__badge.is-self {
  background: rgba(219, 234, 254, 0.92);
  border: 1px solid rgba(147, 197, 253, 0.42);
  color: #1d4ed8;
}

.ticket-message__badge.is-official {
  background: rgba(254, 249, 195, 0.96);
  border: 1px solid rgba(253, 224, 71, 0.38);
  color: #a16207;
}

.ticket-message__content {
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #334155;
}

.ticket-message__time {
  display: block;
  font-size: 12px;
  line-height: 1.4;
  color: #94a3b8;
}

.ticket-message.is-self .ticket-message__time {
  text-align: right;
}

.ticket-message.is-official .ticket-message__time {
  text-align: left;
}

.ticket-reply-box {
  display: grid;
  gap: 12px;
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding-top: 18px;
}

.ticket-empty-state {
  min-height: 220px;
  display: grid;
  place-content: center;
  text-align: center;
  gap: 8px;
}

.ticket-empty-state h3,
.ticket-detail-header h2,
.panel-head h2 {
  margin: 0;
  color: #0f172a;
}

.lead {
  color: #64748b;
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
