<script setup lang="ts">
import type { TicketDetail, TicketItem } from '@/shared/ticketDisplay'
import {
  formatTicketPriority,
  formatTicketStatus,
  formatTicketTime,
  ticketSenderBadgeClass,
  ticketSenderBadgeLabel,
  ticketStatusBadgeClass,
  ticketStatusChipClass,
} from '@/shared/ticketDisplay'
import { TButton, TInput } from 'ui_73info'

/**
 * 工单中心右栏：详情头（编号 / 分类 / 优先级 / 状态 / 关闭）+ 消息时间线 + 回复框。
 *
 * 两套工作台共用这一份结构，靠 `dev` 切类名与标签形态（.dev-chip / .wb-badge）。
 * 组件不取数、不提示：关闭与回复各自 emit 上抛，由 `useTicketCenter` 处理。
 */
defineProps<{
  dev: boolean
  ticket: TicketItem | null
  detail: TicketDetail | null
  detailLoading: boolean
  closing: boolean
  replying: boolean
  username: string
}>()

defineEmits<{ close: []; reply: [] }>()

const replyContent = defineModel<string>('replyContent', { required: true })
</script>

<template>
  <!-- 没有任何工单时这一栏由父级整块不渲染，列表空态占满主栏 -->
  <section
    :class="[
      dev ? 'dev-surface-card ticket-detail-panel' : 'wallet-section ticket-detail-panel',
      { 'is-idle': !(ticket && detail) },
    ]"
  >
    <div v-if="ticket && detail" class="ticket-detail-shell">
      <header class="ticket-detail-header">
        <div class="ticket-detail-header__main">
          <h2>{{ ticket.subject }}</h2>
          <p class="ticket-detail-header__meta">
            <span class="ticket-detail-header__ticket-id">{{ ticket.ticket_id }}</span>
            <span>·</span>
            {{ ticket.category || '未分类' }}
            <span>·</span>
            优先级 {{ formatTicketPriority(ticket.priority) }}
          </p>
        </div>
        <div class="ticket-detail-header__actions">
          <span
            :class="
              dev ? ticketStatusChipClass(ticket.status) : ticketStatusBadgeClass(ticket.status)
            "
            >{{ formatTicketStatus(ticket.status) }}</span
          >
          <button
            v-if="dev && ticket.status !== 'closed'"
            class="dev-btn dev-btn--ghost"
            type="button"
            :disabled="closing"
            @click="$emit('close')"
          >
            {{ closing ? '关闭中...' : '关闭工单' }}
          </button>
          <TButton
            variant="outline"
            v-else-if="ticket.status !== 'closed'"
            :disabled="closing"
            @click="$emit('close')"
          >
            {{ closing ? '关闭中...' : '关闭工单' }}
          </TButton>
        </div>
      </header>

      <div v-if="detailLoading" :class="dev ? 'dev-empty-state' : 'wb-empty'">
        <p>正在同步当前工单的最新消息。</p>
      </div>

      <div v-else class="ticket-thread">
        <article
          v-for="message in detail.messages"
          :key="message.id"
          class="ticket-message"
          :class="{
            'is-self': message.sender === username,
            'is-official': message.sender !== username,
          }"
        >
          <div v-if="message.sender !== username" class="ticket-message__meta">
            <div class="ticket-message__identity">
              <span :class="['ticket-message__badge', ticketSenderBadgeClass(dev)]">
                {{ ticketSenderBadgeLabel(message.sender, message.sender_role, username) }}
              </span>
            </div>
          </div>
          <p class="ticket-message__content">{{ message.content }}</p>
          <time class="ticket-message__time">{{ formatTicketTime(message.created_at) }}</time>
        </article>
      </div>

      <div v-if="ticket.status !== 'closed'" class="ticket-reply-box">
        <!-- 回复框同样用 TInput 与统一层的 TButton，
             否则这里会留下第三种输入框（18px 圆角、蓝色 4px 焦点环）与一枚渐变主按钮。 -->
        <TInput
          v-model="replyContent"
          type="textarea"
          :rows="2"
          placeholder="补充新的现象、截图说明或你的确认结果。"
          @keydown.enter.exact.prevent="replyContent.trim() && $emit('reply')"
        />
        <TButton variant="solid" tone="accent" :loading="replying" @click="$emit('reply')">
          发送回复
        </TButton>
      </div>
    </div>

    <!-- 右侧未选中时的空态也走统一层：原来是自己一套居中文案，
         与其它页的虚线空态框不是一个形态。 -->
    <div v-else :class="dev ? 'dev-empty-state' : 'wb-empty'">
      <p>在列表中选择一张工单，这里会显示消息记录，并可以继续回复。</p>
    </div>
  </section>
</template>

<style scoped>
.ticket-detail-panel {
  display: flex;
  flex-direction: column;
}

.ticket-detail-header,
.ticket-detail-header__actions,
.ticket-message__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
}

.ticket-detail-header {
  min-width: 0;
  align-items: flex-start;
}

.ticket-detail-header__main,
.ticket-detail-header__meta,
.ticket-detail-header__ticket-id {
  min-width: 0;
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

.ticket-detail-header h2 {
  margin: 0;
  color: var(--dev-ink);
}

.ticket-detail-header p,
.ticket-message p {
  margin: 0;
  color: var(--dev-muted);
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
  /* 气泡按内容宽度收缩（短消息不再被拉成整条），自己靠右、客服靠左 */
  justify-items: start;
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
  width: fit-content;
  max-width: min(92%, 760px);
}

.ticket-message.is-self {
  justify-self: end;
  border-color: var(--wb-accent-line);
  background: var(--wb-accent-soft);
}

.ticket-message.is-official {
  justify-self: start;
}

.ticket-message__meta {
  align-items: flex-start;
  font-size: 13px;
  color: var(--dev-muted);
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
   （见 shared/ticketDisplay 的 ticketSenderBadgeClass：开发者侧 dev-chip*、门户侧 wb-badge*），
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

/* 回复框：输入控件是 TInput（它自己按 --73-control-height 给出 36px 控件规格
   与令牌配色），这里只管一行排布。 */
.ticket-reply-box {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid var(--dev-line);
  padding-top: 14px;
}

/* 用户工作台侧的空态走统一层 .wb-empty，里面的段落自带外边距，这里复位一次 */
.wb-empty p {
  margin: 0;
}

@media (max-width: 640px) {
  .ticket-detail-header,
  .ticket-detail-header__actions {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ticket-message {
    max-width: 100%;
  }

  .ticket-message__meta,
  .ticket-message__identity {
    flex-wrap: wrap;
  }

  /* 单栏时「在列表中选择一张工单…」这张占位卡指向的左侧并不存在 */
  .ticket-detail-panel.is-idle {
    display: none;
  }
}
</style>
