<script setup lang="ts">
import { LIST_PAGE_SIZES } from '@/composables/useClientPagination'
import type { TicketItem, TicketPriority, TicketStatus } from '@/shared/ticketDisplay'
import {
  formatTicketPriority,
  formatTicketStatus,
  formatTicketTime,
  isCollapsedTicket,
  ticketStatusBadgeClass,
  ticketStatusChipClass,
} from '@/shared/ticketDisplay'
import TicketEmptyState from '@/components/ticket/TicketEmptyState.vue'
import TicketToolbar from '@/components/ticket/TicketToolbar.vue'
import { TButton, TIcon, TPagination, TSelect, TOption, Plus } from 'ui_73info'

/**
 * 工单中心左栏：卡片头（提交新工单）+ 工具栏（状态 / 优先级 / 搜索 / 重置）+ 列表行 + 表尾分页器。
 *
 * 两套工作台共用这一份结构，靠 `dev` 切类名：开发者侧落 .dev-surface-card / .dev-toolbar /
 * .dev-stack-item / .dev-pager，门户侧落 .wallet-section / .wb-toolbar / .wb-item / .wb-pager。
 * 组件不取数、不碰路由与提示：筛选与页码通过 `update:*` 回传，选中行与新建入口用事件上抛。
 */
const props = defineProps<{
  dev: boolean
  tickets: TicketItem[]
  rows: TicketItem[]
  selectedId: string
  loading: boolean
  hasActiveFilter: boolean
  filteredTotal: number
}>()

defineEmits<{
  select: [ticketId: string]
  compose: []
  reset: []
}>()

const statusFilter = defineModel<'all' | TicketStatus>('statusFilter', { required: true })
const priorityFilter = defineModel<'all' | TicketPriority>('priorityFilter', { required: true })
const searchKeyword = defineModel<string>('searchKeyword', { required: true })
const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

/** 行内摘要：分类 + 优先级，两侧文案同一套。 */
function rowSummary(ticket: TicketItem) {
  return `${ticket.category || '未分类'} · 优先级 ${formatTicketPriority(ticket.priority)}`
}
</script>

<template>
  <aside
    :class="props.dev ? 'dev-surface-card ticket-list-panel' : 'wallet-section ticket-list-panel'"
  >
    <!-- 卡片头：两侧都是统一层的卡头（标题 + 说明 + 右侧动作），
         开发者侧 .dev-card-head / 用户工作台侧 .wb-card-head。 -->
    <div v-if="dev" class="dev-card-head">
      <div class="dev-card-head__title-block">
        <h3 class="dev-section-title">工单列表</h3>
      </div>
      <div class="dev-card-head__actions">
        <button class="dev-btn dev-btn--primary" type="button" @click="$emit('compose')">
          <TIcon>
            <Plus />
          </TIcon>
          <span>提交新工单</span>
        </button>
      </div>
    </div>
    <div v-else class="wb-card-head">
      <div class="wb-card-head__title-block">
        <h3 class="wb-card-head__title">工单列表</h3>
      </div>
      <div class="wb-card-head__actions">
        <TButton variant="solid" tone="accent" @click="$emit('compose')">
          <TIcon>
            <Plus />
          </TIcon>
          <span>提交新工单</span>
        </TButton>
      </div>
    </div>

    <TicketToolbar
      v-if="tickets.length > 0"
      v-model:status-filter="statusFilter"
      v-model:priority-filter="priorityFilter"
      v-model:search-keyword="searchKeyword"
      :dev="dev"
      :has-active-filter="hasActiveFilter"
      :filtered-total="filteredTotal"
      @reset="$emit('reset')"
    />

    <p
      v-if="loading && tickets.length === 0"
      :class="dev ? 'dev-empty-state' : 'wb-empty'"
      role="status"
    >
      正在加载工单…
    </p>

    <!-- 空态：没有工单时整块换成引导，筛选无结果时给「清除筛选」的出口 -->
    <TicketEmptyState
      v-else-if="filteredTotal === 0"
      :dev="dev"
      :has-tickets="tickets.length > 0"
      :has-active-filter="hasActiveFilter"
      @reset="$emit('reset')"
      @compose="$emit('compose')"
    />

    <!-- 列表行：开发者侧复用统一层的 .dev-stack-item（内嵌块：冷白底 + --dev-line 描边 + 12px 圆角），
         行内状态标签走 .dev-chip 胶囊；用户工作台侧走 .wb-item（卡片式行）+ .wb-badge。
         两侧各自挂在只有自己会命中的类名上，本页 scoped 样式不再跨层覆盖。 -->
    <button
      v-for="ticket in rows"
      :key="ticket.ticket_id"
      type="button"
      :class="
        dev
          ? [
              'ticket-list-item',
              'dev-stack-item',
              {
                active: selectedId === ticket.ticket_id,
                'is-collapsed': isCollapsedTicket(ticket.status),
              },
            ]
          : [
              'wb-item',
              'wb-item--clickable',
              'ticket-list-row',
              { 'wb-item--active': selectedId === ticket.ticket_id },
            ]
      "
      @click="$emit('select', ticket.ticket_id)"
    >
      <div v-if="dev" class="ticket-list-item__body">
        <div class="ticket-list-item__top">
          <strong class="ticket-list-item__subject">{{ ticket.subject }}</strong>
          <span :class="ticketStatusChipClass(ticket.status)">{{
            formatTicketStatus(ticket.status)
          }}</span>
        </div>
        <p v-if="!isCollapsedTicket(ticket.status)" class="ticket-list-item__summary">
          {{ rowSummary(ticket) }}
        </p>
        <div class="ticket-list-item__meta">
          <span class="ticket-list-item__ticket-id" :title="ticket.ticket_id">{{
            ticket.ticket_id
          }}</span>
          <time class="ticket-list-item__time">{{ formatTicketTime(ticket.updated_at) }}</time>
        </div>
      </div>
      <template v-else>
        <div class="wb-item__main">
          <strong class="wb-item__title">{{ ticket.subject }}</strong>
          <span v-if="!isCollapsedTicket(ticket.status)" class="wb-item__meta">
            {{ rowSummary(ticket) }}
          </span>
          <span class="wb-item__meta"
            >{{ ticket.ticket_id }} · {{ formatTicketTime(ticket.updated_at) }}</span
          >
        </div>
        <div class="wb-item__side">
          <span :class="ticketStatusBadgeClass(ticket.status)">{{
            formatTicketStatus(ticket.status)
          }}</span>
        </div>
      </template>
    </button>

    <!-- 表尾分页器：与资源项目、需求大厅、团队资源同一枚，两侧都挂在各自的统一层上。 -->
    <div v-if="dev && tickets.length > 0" class="dev-pager">
      <div class="dev-pager__count">
        <TSelect v-model="pageSize" aria-label="每页条数" class="dev-pager__size">
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="`${size} 条/页`"
            :value="size"
          />
        </TSelect>
      </div>
      <TPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredTotal"
        :pager-count="5"
        background
        aria-label="工单列表分页"
      />
    </div>

    <div v-else-if="tickets.length > 0" class="wb-pager">
      <div class="wb-pager__count">
        <TSelect v-model="pageSize" aria-label="每页条数" class="wb-pager__size">
          <TOption
            v-for="size in LIST_PAGE_SIZES"
            :key="size"
            :label="`${size} 条/页`"
            :value="size"
          />
        </TSelect>
      </div>
      <TPagination
        v-model:current-page="page"
        :page-size="pageSize"
        :total="filteredTotal"
        :pager-count="5"
        background
        aria-label="工单列表分页"
      />
    </div>
  </aside>
</template>

<style scoped>
/* 面板内的隐式列必须钉成 minmax(0, 1fr)：列表、工具栏、分页器的 min-content
   都比 360px 的窄栏宽，默认的 min-width: auto 会把内层网格撑到 390px 上下，
   于是工具栏右侧的「重置」被卡片边缘裁掉。 */
.ticket-list-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-content: start;
  min-width: 0;
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
  /* 行内也是同一种问题：工单号不折行，min-content 会把行撑得比卡片还宽，
     状态标签因此被 overflow: hidden 裁掉。钉死 minmax(0, 1fr) 让单号自己省略。 */
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  overflow: hidden;
}

.ticket-list-item__body {
  min-width: 0;
}

/* 已关闭/已解决：自动收缩，减少高度并淡显示 */
.ticket-list-item.is-collapsed {
  opacity: 0.6;
}

/* 选中行取统一层的主色（--dev-blue 与门户侧 --wb-accent 同值），
   原来是页面自己的一套亮蓝（color-mix(in srgb, var(--73-accent) NaN%, transparent)）。 */
.ticket-list-item.active {
  border-color: var(--wb-accent-line);
  background: var(--wb-accent-soft);
  box-shadow: 0 0 0 1px var(--wb-accent-line) inset;
}

.ticket-list-item__top,
.ticket-list-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.ticket-list-item__subject,
.ticket-list-item__summary,
.ticket-list-item__ticket-id {
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

.ticket-list-item p {
  margin: 0;
  color: var(--dev-muted);
}

.ticket-list-item__meta {
  font-size: 13px;
  color: var(--dev-muted);
}

/* 门户侧的行是 <button>：统一层的 .wb-item 只管版面，
   按钮自带的居中与字体要在本页复位，否则标题与读数会居中排 */
.ticket-list-row {
  width: 100%;
  font: inherit;
  text-align: left;
}

/* R047 断点收敛：原档位 720px → 640px */
@media (max-width: 640px) {
  .ticket-list-item__meta {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ticket-list-item__time {
    white-space: normal;
  }
}
</style>
