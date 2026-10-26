<script setup lang="ts">
import { useTicketCenter } from '@/composables/useTicketCenter'
import {
  TICKET_PRIORITY_FILTER_OPTIONS,
  TICKET_PRIORITY_OPTIONS,
  TICKET_STATUS_FILTER_OPTIONS,
  formatTicketTime,
  ticketPriorityLabel,
  ticketStatusLabel,
} from '@/shared/ticketDisplay'
import { TButton, TDialog } from 'ui_73info'

const {
  auth,
  loading,
  detailLoading,
  creating,
  replying,
  closing,
  loadError,
  detailError,
  createError,
  replyError,
  tickets,
  selectedId,
  detail,
  keyword,
  status,
  priority,
  composeOpen,
  subject,
  category,
  newPriority,
  content,
  replyContent,
  stats,
  filtered,
  hasFilters,
  loadTickets,
  loadDetail,
  resetFilters,
  openCompose,
  submitCreate,
  submitReply,
  submitClose,
} = useTicketCenter()
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
      <div class="wb-strip__item wb-strip__action">
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
          <input v-model="keyword" type="search" placeholder="搜索标题、编号或分类" />
          <select v-model="status">
            <option
              v-for="option in TICKET_STATUS_FILTER_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <select v-model="priority">
            <option
              v-for="option in TICKET_PRIORITY_FILTER_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
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
          {{ tickets.length ? '没有符合条件的工单' : '还没有工单，遇到问题可以在这里提交' }}
        </div>
        <ul v-else class="ticket-items">
          <li v-for="ticket in filtered" :key="ticket.ticket_id">
            <button
              type="button"
              class="ticket-item"
              :class="{ 'ticket-item--active': ticket.ticket_id === selectedId }"
              @click="loadDetail(ticket.ticket_id)"
            >
              <span class="ticket-item__top">
                <strong>{{ ticket.subject }}</strong>
                <span :class="`ticket-status ticket-status--${ticket.status}`">{{
                  ticketStatusLabel(ticket.status)
                }}</span>
              </span>
              <span class="ticket-item__meta"
                >{{ ticket.ticket_id }} · {{ ticketPriorityLabel(ticket.priority) }}</span
              >
              <span class="ticket-item__meta"
                >更新于 {{ formatTicketTime(ticket.updated_at) }}</span
              >
            </button>
          </li>
        </ul>
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
            <TButton
              variant="outline"
              tone="danger"
              :loading="closing"
              :disabled="detail.ticket.status === 'closed'"
              @click="submitClose"
            >
              {{ detail.ticket.status === 'closed' ? '已关闭' : '关闭工单' }}
            </TButton>
          </div>
          <ul class="ticket-messages">
            <li v-for="message in detail.messages" :key="message.id">
              <div class="ticket-message__head">
                <strong>{{ message.sender === auth.username ? '我' : '官方回复' }}</strong>
                <time>{{ formatTicketTime(message.created_at) }}</time>
              </div>
              <p>{{ message.content }}</p>
            </li>
          </ul>
          <div v-if="detail.ticket.status !== 'closed'" class="ticket-reply">
            <textarea v-model="replyContent" rows="3" placeholder="补充说明或回复客服" />
            <p v-if="replyError" role="alert">{{ replyError }}</p>
            <TButton variant="solid" tone="accent" :loading="replying" @click="submitReply"
              >发送回复</TButton
            >
          </div>
        </template>
        <div v-else class="wb-empty">选择一条工单查看详情</div>
      </section>
    </section>

    <TDialog :open="composeOpen" title="新建工单" width="560px" @update:open="composeOpen = $event">
      <div class="ticket-compose">
        <label
          >标题<input v-model="subject" maxlength="120" placeholder="简要说明遇到的问题"
        /></label>
        <label
          >分类<input v-model="category" maxlength="50" placeholder="如：账号 / 支付 / 资源"
        /></label>
        <label>
          优先级
          <select v-model="newPriority">
            <option
              v-for="option in TICKET_PRIORITY_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <label
          >问题描述<textarea v-model="content" rows="5" placeholder="补充复现步骤和期望结果" />
        </label>
        <p v-if="createError" role="alert">{{ createError }}</p>
        <div class="ticket-compose__actions">
          <TButton variant="outline" :disabled="creating" @click="composeOpen = false"
            >取消</TButton
          >
          <TButton variant="solid" tone="accent" :loading="creating" @click="submitCreate"
            >提交工单</TButton
          >
        </div>
      </div>
    </TDialog>
  </main>
</template>

<style scoped src="@/styles/ticket-center.css"></style>
