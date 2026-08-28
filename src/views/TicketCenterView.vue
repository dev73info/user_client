<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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

const priorityOpen = ref(false)
const prioritySelectRef = ref<HTMLElement | null>(null)

const priorityOptions: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: '低优先级' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

const selectedPriorityLabel = computed(
  () => priorityOptions.find((option) => option.value === newPriority.value)?.label ?? '',
)

function selectPriority(value: TicketPriority) {
  newPriority.value = value
  priorityOpen.value = false
}

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

function onDocumentClick(event: MouseEvent) {
  const el = prioritySelectRef.value
  if (el && !el.contains(event.target as Node)) {
    priorityOpen.value = false
  }
}

onMounted(async () => {
  auth.hydrate()
  document.addEventListener('click', onDocumentClick)
  await loadTicketsAndKeepSelection()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <main class="portal-page ticket-page-shell">
    <section class="portal-page__stats">
      <article class="portal-page__stat-card">
        <span>全部工单</span>
        <strong>{{ ticketStats.total }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>处理中</span>
        <strong>{{ ticketStats.pending }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>已完成</span>
        <strong>{{ ticketStats.resolved }}</strong>
      </article>
      <article class="portal-page__stat-card">
        <span>优先级档位</span>
        <strong>{{ priorityOptions.length }}</strong>
      </article>
    </section>

    <section class="ticket-main-grid">
      <aside class="portal-page__panel ticket-list-panel">
        <div class="panel-head">
          <div>
            <h2>工单列表</h2>
          </div>
          <button class="ticket-primary-btn" type="button" @click="openCompose">
            提交新工单
          </button>
        </div>

        <div v-if="!loading && tickets.length === 0" class="ticket-empty-state">
          <p>提交第一张工单后，这里会显示处理状态和最近回复。</p>
        </div>

        <button v-for="ticket in sortedTickets" :key="ticket.ticket_id" class="ticket-list-item"
          :class="{ active: selectedTicketId === ticket.ticket_id, 'is-collapsed': isCollapsedTicket(ticket.status) }"
          type="button" @click="loadDetail(ticket.ticket_id)">
          <div class="ticket-list-item__top">
            <strong class="ticket-list-item__subject">{{ ticket.subject }}</strong>
            <span class="ticket-status-pill" :class="`is-${ticket.status}`">{{ formatStatus(ticket.status) }}</span>
          </div>
          <p v-if="!isCollapsedTicket(ticket.status)" class="ticket-list-item__summary">{{
            ticket.category || '未分类' }} · 优先级 {{ formatPriority(ticket.priority) }}</p>
          <div class="ticket-list-item__meta">
            <span class="ticket-list-item__ticket-id" :title="ticket.ticket_id">{{ ticket.ticket_id }}</span>
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
            <p>正在同步当前工单的最新消息。</p>
          </div>

          <div v-else class="ticket-thread">
            <article v-for="message in currentDetail.messages" :key="message.id" class="ticket-message"
              :class="{ 'is-self': message.sender === auth.username, 'is-official': message.sender !== auth.username }">
              <div v-if="message.sender !== auth.username" class="ticket-message__meta">
                <div class="ticket-message__identity">
                  <span class="ticket-message__badge is-official">
                    {{ messageBadgeLabel(message.sender, message.sender_role) }}
                  </span>
                </div>
              </div>
              <p class="ticket-message__content">{{ message.content }}</p>
              <time class="ticket-message__time">{{ formatTime(message.created_at) }}</time>
            </article>
          </div>

          <div v-if="selectedTicket.status !== 'closed'" class="ticket-reply-box">
            <textarea v-model="replyContent" rows="2" placeholder="补充新的现象、截图说明或你的确认结果。"
              @keydown.enter.exact.prevent="replyContent.trim() && submitReply()" />
            <button class="ticket-primary-btn" type="button" :disabled="replying" @click="submitReply">
              {{ replying ? '发送中...' : '发送回复' }}
            </button>
          </div>
        </div>

        <div v-else class="ticket-empty-state">
          <p>左侧会展示你的全部工单。选中后可以查看消息记录并继续回复。</p>
        </div>
      </section>
    </section>

    <el-dialog v-model="composeOpen" title="提交新工单" width="720px" :close-on-click-modal="false">
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
          <div ref="prioritySelectRef" class="priority-select" :class="{ 'is-open': priorityOpen }">
            <button class="priority-select__trigger" :class="`is-${newPriority}`" type="button"
              @click="priorityOpen = !priorityOpen" aria-haspopup="listbox" :aria-expanded="priorityOpen">
              <span class="priority-select__value">
                <span class="priority-select__dot" aria-hidden="true"></span>
                <span>{{ selectedPriorityLabel }}</span>
              </span>
              <span class="priority-select__arrow">⌄</span>
            </button>
            <div v-if="priorityOpen" class="priority-select__menu" role="listbox">
              <button v-for="option in priorityOptions" :key="option.value" type="button" role="option"
                class="priority-select__option"
                :class="[`is-${option.value}`, { 'is-active': option.value === newPriority }]"
                @click="selectPriority(option.value)">
                {{ option.label }}
              </button>
            </div>
          </div>
        </label>
        <label class="field field--full">
          <span>问题描述</span>
          <textarea v-model="newContent" rows="5" placeholder="请描述你遇到的问题、已尝试的操作，以及希望得到的处理结果。" />
        </label>
      </div>

      <template #footer>
        <div class="compose-actions">
          <button class="ticket-primary-btn" type="button" :disabled="creating" @click="submitCreate">
            {{ creating ? '提交中...' : '提交工单' }}
          </button>
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

/* 统计条保持一行 4 列，避免被全局响应式断点改写成两行 */
.ticket-page-shell .portal-page__stats {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.ticket-list-panel,
.ticket-detail-panel {
  padding: 18px;
  display: flex;
  flex-direction: column;
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

.priority-select {
  position: relative;
}

.priority-select__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 16px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  padding: 12px 14px;
  box-sizing: border-box;
  outline: none;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  text-align: left;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.priority-select__value {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.priority-select__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--priority-color, #94a3b8);
  flex-shrink: 0;
}

.priority-select__trigger.is-low {
  --priority-color: #16a34a;
}

.priority-select__trigger.is-normal {
  --priority-color: #3b82f6;
}

.priority-select__trigger.is-high {
  --priority-color: #f59e0b;
}

.priority-select__trigger.is-urgent {
  --priority-color: #ef4444;
}

.priority-select.is-open .priority-select__trigger {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.priority-select__arrow {
  transition: transform 0.2s;
  color: #64748b;
}

.priority-select.is-open .priority-select__arrow {
  transform: rotate(180deg);
}

.priority-select__menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  border: 1px solid rgba(198, 210, 236, 0.82);
  border-radius: 14px;
  background: rgba(243, 246, 252, 0.98);
  box-shadow: 0 12px 28px rgba(76, 103, 172, 0.14);
  overflow: hidden;
  padding: 4px;
}

.priority-select__option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: #0f172a;
  padding: 10px 12px;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.priority-select__option::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--priority-color, #94a3b8);
  flex-shrink: 0;
}

.priority-select__option.is-low {
  --priority-color: #16a34a;
  --priority-soft: rgba(22, 163, 74, 0.12);
}

.priority-select__option.is-normal {
  --priority-color: #3b82f6;
  --priority-soft: rgba(59, 130, 246, 0.12);
}

.priority-select__option.is-high {
  --priority-color: #f59e0b;
  --priority-soft: rgba(245, 158, 11, 0.14);
}

.priority-select__option.is-urgent {
  --priority-color: #ef4444;
  --priority-soft: rgba(239, 68, 68, 0.12);
}

.priority-select__option:hover {
  background: var(--priority-soft, rgba(96, 165, 250, 0.1));
}

.priority-select__option.is-active {
  background: var(--priority-color, #3b82f6);
  color: #fff;
}

.priority-select__option.is-active::before {
  background: #fff;
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
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
}

.ticket-primary-btn {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2563eb, #4f8cff);
  color: #fff;
  font-weight: 700;
}

.ticket-secondary-btn,
.refresh-btn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 12px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 700;
}

.refresh-btn {
  background: #ffffff;
  border: 1px solid rgba(203, 213, 225, 0.95);
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.08);
  color: #334155;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(241, 245, 249, 0.96);
  box-shadow: 0 10px 24px rgba(76, 103, 172, 0.12);
  transform: translateY(-1px);
}

.refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

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

.ticket-list-item {
  width: 100%;
  text-align: left;
  border-radius: 14px;
  border: 1px solid rgba(198, 210, 236, 0.72);
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  padding: 12px 14px;
  cursor: pointer;
  display: grid;
  gap: 6px;
  overflow: hidden;
}

/* 已关闭/已解决：自动收缩，减少高度并淡显示 */
.ticket-list-item.is-collapsed {
  opacity: 0.6;
  padding: 10px 14px;
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
  background: rgba(254, 243, 199, 0.96);
  color: #d97706;
}

.ticket-status-pill.is-processing {
  background: rgba(219, 234, 254, 0.92);
  color: #1d4ed8;
}

.ticket-status-pill.is-resolved {
  background: rgba(220, 252, 231, 0.92);
  color: #15803d;
}

.ticket-status-pill.is-closed {
  background: rgba(241, 245, 249, 0.96);
  color: #64748b;
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
  font-size: 14px;
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
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid rgba(226, 232, 240, 0.92);
  padding-top: 14px;
}

.ticket-reply-box textarea {
  flex: 1 1 auto;
  min-width: 0;
  border-radius: 16px;
  border: 1px solid rgba(198, 210, 236, 0.82);
  background: rgba(248, 250, 252, 0.96);
  color: #0f172a;
  padding: 12px 14px;
  box-sizing: border-box;
  outline: none;
  resize: vertical;
  line-height: 1.6;
  font-family: inherit;
}

.ticket-reply-box textarea:focus {
  border-color: #60a5fa;
  box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
}

.ticket-reply-box .ticket-primary-btn {
  flex: 0 0 auto;
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
