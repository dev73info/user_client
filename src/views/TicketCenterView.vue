<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { TicketAttachment } from '@/api/tickets'
import TicketAttachments from '@/components/ticket/TicketAttachments.vue'
import TicketComposer from '@/components/ticket/TicketComposer.vue'
import TicketProgress from '@/components/ticket/TicketProgress.vue'
import TicketSatisfactionDialog from '@/components/ticket/TicketSatisfactionDialog.vue'
import { useTicketActions } from '@/composables/useTicketActions'
import { useTicketList } from '@/composables/useTicketList'
import { useTicketRealtime } from '@/composables/useTicketRealtime'
import {
  TICKET_PRIORITY_FILTER_OPTIONS,
  TICKET_STATUS_FILTER_OPTIONS,
  formatTicketTime,
  hasTicketSatisfaction,
  ticketPriorityLabel,
  ticketSatisfactionStars,
  ticketStatusLabel,
  type TicketStatusFilter,
} from '@/shared/ticketDisplay'
import { useAuthStore } from '@/stores/auth'
import { Search, TButton, TIcon, TInput } from 'ui_73info'

const auth = useAuthStore()
const list = useTicketList()
const actions = useTicketActions(list)
const { realtimeWarning, connect } = useTicketRealtime((id) => list.handleTicketUpdated(id))

const {
  tickets,
  page,
  pageCount,
  status,
  keyword,
  priority,
  loading,
  loadError,
  selectedId,
  detail,
  detailLoading,
  detailError,
  filtered,
  stats,
  hasFilters,
  loadTickets,
  loadDetail,
  selectTicket,
  setStatus,
  setPage,
  resetFilters,
} = list
const {
  categories,
  creating,
  replying,
  closing,
  reopening,
  rating,
  createError,
  replyError,
  actionError,
  composeOpen,
  satisfactionOpen,
  openCompose,
  submitCreate,
  submitReply,
  submitClose,
  submitReopen,
  submitSatisfaction,
  uploadAttachment,
  downloadAttachment,
} = actions

const replyContent = ref('')
const replyAttachments = ref<TicketAttachment[]>([])
const replyUploading = ref(false)

onMounted(() => {
  auth.hydrate()
  void loadTickets()
  connect()
})

function onStatusChange(event: Event) {
  setStatus((event.target as HTMLSelectElement).value as TicketStatusFilter)
}

async function uploadReplyFile(file: File) {
  replyError.value = ''
  replyUploading.value = true
  try {
    const uploaded = await uploadAttachment(file)
    replyAttachments.value = [...replyAttachments.value, uploaded]
  } catch (err) {
    replyError.value = err instanceof Error && err.message ? err.message : '上传附件失败'
  } finally {
    replyUploading.value = false
  }
}

function removeReplyAttachment(attachment: TicketAttachment) {
  replyAttachments.value = replyAttachments.value.filter((item) => item.id !== attachment.id)
}

async function sendReply() {
  const ok = await submitReply(
    replyContent.value,
    replyAttachments.value.map((item) => item.id),
  )
  if (!ok) return
  replyContent.value = ''
  replyAttachments.value = []
}
</script>

<template>
  <main class="page-shell custom-page-shell profile-page ticket-page">
    <section class="wb-strip ticket-strip" aria-label="工单概览">
      <div class="wb-strip__item">
        <span>全部工单</span><strong>{{ stats.total }}</strong>
      </div>
      <div class="wb-strip__item">
        <span>处理中</span><strong>{{ stats.pending }}</strong>
      </div>
      <div class="wb-strip__item">
        <span>已结束</span><strong>{{ stats.resolved }}</strong>
      </div>
      <div class="wb-strip__item">
        <span>未读</span><strong>{{ stats.unread }}</strong>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <span v-if="realtimeWarning" class="ticket-realtime">{{ realtimeWarning }}</span>
        <TButton variant="outline" :loading="loading" @click="loadTickets">刷新</TButton>
      </div>
    </section>

    <section class="ticket-layout">
      <aside class="wallet-section ticket-list">
        <div class="ticket-head">
          <h3>工单中心</h3>
          <TButton variant="solid" tone="accent" @click="openCompose">新建工单</TButton>
        </div>
        <div class="ticket-filters">
          <TInput
            v-model="keyword"
            class="ticket-filters__search"
            clearable
            placeholder="搜索标题、编号或分类"
            aria-label="搜索工单"
          >
            <template #prefix
              ><TIcon><Search /></TIcon
            ></template>
          </TInput>
          <select :value="status" @change="onStatusChange">
            <option v-for="o in TICKET_STATUS_FILTER_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
          <select v-model="priority">
            <option v-for="o in TICKET_PRIORITY_FILTER_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
          <TButton v-if="hasFilters" variant="outline" @click="resetFilters">重置</TButton>
        </div>
        <p v-if="loading" class="wb-empty" role="status">正在加载工单…</p>
        <div v-else-if="loadError" class="wb-empty" role="alert">
          <span>{{ loadError }}</span
          ><TButton variant="outline" @click="loadTickets">重试</TButton>
        </div>
        <div v-else-if="!filtered.length" class="wb-empty">
          {{ tickets.length ? '本页没有符合条件的工单' : '还没有工单，遇到问题可以在这里提交' }}
        </div>
        <ul v-else class="ticket-items">
          <li v-for="ticket in filtered" :key="ticket.ticket_id">
            <button
              type="button"
              class="ticket-item"
              :class="{ 'ticket-item--active': ticket.ticket_id === selectedId }"
              @click="selectTicket(ticket.ticket_id)"
            >
              <span class="ticket-item__top">
                <strong>{{ ticket.subject }}</strong>
                <span class="ticket-item__badges">
                  <span v-if="(ticket.unread_count ?? 0) > 0" class="ticket-unread">
                    {{ ticket.unread_count }}
                  </span>
                  <span :class="`ticket-status ticket-status--${ticket.status}`">
                    {{ ticketStatusLabel(ticket.status) }}
                  </span>
                </span>
              </span>
              <span class="ticket-item__meta">
                {{ ticket.ticket_id }} · {{ ticketPriorityLabel(ticket.priority) }}
              </span>
              <span class="ticket-item__meta"
                >更新于 {{ formatTicketTime(ticket.updated_at) }}</span
              >
            </button>
          </li>
        </ul>
        <div v-if="pageCount > 1" class="ticket-pager">
          <TButton variant="outline" size="sm" :disabled="page <= 1" @click="setPage(page - 1)">
            上一页
          </TButton>
          <span class="ticket-pager__text">{{ page }} / {{ pageCount }}</span>
          <TButton
            variant="outline"
            size="sm"
            :disabled="page >= pageCount"
            @click="setPage(page + 1)"
          >
            下一页
          </TButton>
        </div>
      </aside>

      <section class="wallet-section ticket-detail">
        <p v-if="detailLoading" class="wb-empty" role="status">正在加载详情…</p>
        <div v-else-if="detailError" class="wb-empty" role="alert">
          <span>{{ detailError }}</span>
          <TButton v-if="selectedId" variant="outline" @click="loadDetail(selectedId)"
            >重试</TButton
          >
        </div>
        <template v-else-if="detail">
          <div class="ticket-head">
            <div>
              <h3>{{ detail.ticket.subject }}</h3>
              <p class="ticket-item__meta">
                {{ detail.ticket.ticket_id }} · {{ ticketPriorityLabel(detail.ticket.priority) }} ·
                {{ formatTicketTime(detail.ticket.created_at) }}
              </p>
            </div>
            <div class="ticket-head__actions">
              <TButton
                v-if="detail.actions.can_close"
                variant="outline"
                tone="danger"
                :loading="closing"
                @click="submitClose"
              >
                关闭工单
              </TButton>
              <TButton
                v-if="detail.actions.can_reopen"
                variant="outline"
                :loading="reopening"
                @click="submitReopen"
              >
                重开工单
              </TButton>
            </div>
          </div>

          <TicketProgress :ticket="detail.ticket" :events="detail.events" />

          <section v-if="hasTicketSatisfaction(detail.ticket)" class="ticket-satisfaction-view">
            <div class="ticket-satisfaction-view__head">
              <strong>满意度</strong>
              <span class="ticket-satisfaction-view__stars">
                {{ ticketSatisfactionStars(detail.ticket.satisfaction_rating) }}
              </span>
              <TButton
                v-if="detail.actions.can_rate"
                variant="text"
                tone="accent"
                size="sm"
                @click="satisfactionOpen = true"
              >
                修改评价
              </TButton>
            </div>
            <p v-if="detail.ticket.satisfaction_comment" class="ticket-item__meta">
              {{ detail.ticket.satisfaction_comment }}
            </p>
          </section>
          <section v-else-if="detail.actions.can_rate" class="ticket-satisfaction-view">
            <div class="ticket-satisfaction-view__head">
              <strong>满意度</strong>
              <TButton variant="outline" size="sm" @click="satisfactionOpen = true"
                >评价工单</TButton
              >
            </div>
          </section>

          <ul class="ticket-messages">
            <li v-for="message in detail.messages" :key="message.id">
              <div class="ticket-message__head">
                <strong>{{ message.sender === auth.username ? '我' : '官方回复' }}</strong>
                <time>{{ formatTicketTime(message.created_at) }}</time>
              </div>
              <p>{{ message.content }}</p>
              <TicketAttachments
                :attachments="message.attachments"
                readonly
                @download="downloadAttachment"
              />
            </li>
          </ul>

          <div v-if="detail.actions.can_reply" class="ticket-reply">
            <textarea v-model="replyContent" rows="3" placeholder="补充说明或回复客服" />
            <TicketAttachments
              :attachments="replyAttachments"
              :uploading="replyUploading"
              @upload="uploadReplyFile"
              @remove="removeReplyAttachment"
              @download="downloadAttachment"
            />
            <p v-if="replyError" role="alert">{{ replyError }}</p>
            <p v-else-if="actionError" role="alert">{{ actionError }}</p>
            <TButton variant="solid" tone="accent" :loading="replying" @click="sendReply">
              发送回复
            </TButton>
          </div>
          <div v-else class="ticket-reply ticket-reply--blocked">
            <p v-if="actionError" role="alert">{{ actionError }}</p>
            <span class="ticket-item__meta">当前不可回复</span>
          </div>
        </template>
        <div v-else class="wb-empty">选择一条工单查看详情</div>
      </section>
    </section>

    <TicketComposer
      :open="composeOpen"
      :categories="categories"
      :loading="creating"
      :error="createError"
      :upload="uploadAttachment"
      @update:open="composeOpen = $event"
      @submit="submitCreate"
    />
    <TicketSatisfactionDialog
      :open="satisfactionOpen"
      :loading="rating"
      :rating="detail?.ticket.satisfaction_rating"
      :comment="detail?.ticket.satisfaction_comment"
      @update:open="satisfactionOpen = $event"
      @submit="submitSatisfaction"
    />
  </main>
</template>

<style scoped src="@/styles/ticket-center.css"></style>
