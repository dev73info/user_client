<script setup lang="ts">
import TicketComposeDialog from '@/components/ticket/TicketComposeDialog.vue'
import TicketDetailPanel from '@/components/ticket/TicketDetailPanel.vue'
import TicketListPanel from '@/components/ticket/TicketListPanel.vue'
import TicketStatsStrip from '@/components/ticket/TicketStatsStrip.vue'
import { useTicketCenter } from '@/composables/useTicketCenter'

/**
 * 工单中心（用户工作台 / 开发者工作台共用一页）。
 *
 * 页面只剩四段结构：顶部读数条 / 左列工单列表 / 右列详情 / 新建弹窗。
 * 取数、筛选、分页、提交都在 `useTicketCenter` 与 `shared/ticketDisplay` 的纯函数里；
 * 区块组件只接收展示值，用 `update:*` 与具名事件把动作递回来，不直接碰路由 / 提示 / 接口。
 *
 * 两套工作台靠路由 meta 判定（工作台入口 workbench-tickets、开发者入口 dev-tickets），
 * 组件内部再按 `dev` 切换两套统一层的类名，版式与令牌互不串门。
 */
const {
  isDevWorkbench,
  username,
  loading,
  detailLoading,
  creating,
  replying,
  closing,
  tickets,
  selectedTicket,
  selectedTicketId,
  currentDetail,
  ticketStats,
  pagedTickets,
  filteredTotal,
  searchKeyword,
  statusFilter,
  priorityFilter,
  hasActiveFilter,
  page,
  pageSize,
  composeOpen,
  newSubject,
  newCategory,
  newPriority,
  newContent,
  replyContent,
  openCompose,
  resetFilters,
  refresh,
  loadDetail,
  submitCreate,
  submitReply,
  submitClose,
} = useTicketCenter()
</script>

<template>
  <main
    :class="
      isDevWorkbench
        ? 'dev-page ticket-page-shell'
        : 'page-shell custom-page-shell profile-page ticket-page-shell'
    "
  >
    <TicketStatsStrip
      :dev="isDevWorkbench"
      :total="ticketStats.total"
      :pending="ticketStats.pending"
      :resolved="ticketStats.resolved"
      :loading="loading"
      @refresh="refresh"
    />

    <section class="ticket-main-grid" :class="{ 'ticket-main-grid--empty': tickets.length === 0 }">
      <TicketListPanel
        v-model:status-filter="statusFilter"
        v-model:priority-filter="priorityFilter"
        v-model:search-keyword="searchKeyword"
        v-model:page="page"
        v-model:page-size="pageSize"
        :dev="isDevWorkbench"
        :tickets="tickets"
        :rows="pagedTickets"
        :selected-id="selectedTicketId"
        :loading="loading"
        :has-active-filter="hasActiveFilter"
        :filtered-total="filteredTotal"
        @select="loadDetail"
        @compose="openCompose"
        @reset="resetFilters"
      />

      <!-- 没有任何工单时右侧详情没有可展示的内容，整块隐藏，列表空态占满主栏 -->
      <TicketDetailPanel
        v-if="tickets.length > 0"
        v-model:reply-content="replyContent"
        :dev="isDevWorkbench"
        :ticket="selectedTicket"
        :detail="currentDetail"
        :detail-loading="detailLoading"
        :closing="closing"
        :replying="replying"
        :username="username"
        @close="submitClose"
        @reply="submitReply"
      />
    </section>

    <TicketComposeDialog
      v-model:open="composeOpen"
      v-model:subject="newSubject"
      v-model:category="newCategory"
      v-model:priority="newPriority"
      v-model:content="newContent"
      :dev="isDevWorkbench"
      :creating="creating"
      @submit="submitCreate"
    />
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
.ticket-main-grid {
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 22px;
}

/* 没有工单时详情栏不渲染，列表空态占满整行（否则右半栏只剩一块空白） */
.ticket-main-grid--empty {
  grid-template-columns: minmax(0, 1fr);
}

/* R047 断点收敛：原档位 1080px → 1180px */
@media (max-width: 1180px) {
  .ticket-main-grid {
    grid-template-columns: 1fr;
  }
}
</style>
