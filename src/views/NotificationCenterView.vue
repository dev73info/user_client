<script setup lang="ts">
import NotificationCardItem from '@/components/notification/NotificationCardItem.vue'
import NotificationsEmptyState from '@/components/notification/NotificationsEmptyState.vue'
import NotificationsOverviewStrip from '@/components/notification/NotificationsOverviewStrip.vue'
import NotificationsPager from '@/components/notification/NotificationsPager.vue'
import NotificationsToolbar from '@/components/notification/NotificationsToolbar.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useNotificationCardActions } from '@/composables/useNotificationCardActions'
import { useNotificationCenter } from '@/composables/useNotificationCenter'
import { Bell, TButton, TIcon } from 'ui_73info'

/* 「系统通知」：评论警告、历史沟通公开申请、资源过户、解除合作案件、平台公告统一成同一种消息卡片。
   数据、筛选与动作在 composables 里（useNotificationCenter / useNotificationCardActions），
   本文件只摆版面：读数条 → 卡头 → 提示条 → 工具栏 → 列表 / 空态 / 分页。

   两个工作台共用这一页（用户端 workbench-notifications / 开发者端 dev-notifications），
   与消息中心、工单中心同一办法：页面根元素按 isDevWorkbench 在两套统一层之间切，
   不写「近似」对方的覆盖样式；类别色由根元素上的 --nc-* 令牌下发，各构件只引用变量。 */
const {
  isDevWorkbench,
  loading,
  warningError,
  cards,
  kindCounts,
  kindFilters,
  kindFilter,
  keyword,
  filteredCards,
  filteredTotal,
  pendingActions,
  filtersActive,
  displayCards,
  page,
  pageSize,
  emptyTitle,
  resetFilters,
  loadNotifications,
  loadDisclosures,
  loadTransfers,
  openAnnouncement,
} = useNotificationCenter()

const { votingId, respondingTransferId, vote, respondTransfer, cancelTransfer } =
  useNotificationCardActions({
    refreshDisclosures: loadDisclosures,
    refreshTransfers: loadTransfers,
  })
</script>

<template>
  <main
    :class="
      isDevWorkbench
        ? 'dev-page notifications-page'
        : 'page-shell custom-page-shell profile-page notifications-page'
    "
    :aria-busy="loading"
  >
    <!-- 顶部读数条：两端共用用户工作台这一层（.wb-strip），开发者侧第三格换成「资源过户」 -->
    <WorkbenchBarSlot>
      <NotificationsOverviewStrip
        :dev="isDevWorkbench"
        :loading="loading"
        :total="cards.length"
        :pending="pendingActions"
        :transfer-count="kindCounts['resource-transfer']"
        :warning-count="kindCounts['comment-warning']"
        :announcement-count="kindCounts.announcement"
        @refresh="loadNotifications(true)"
      />
    </WorkbenchBarSlot>

    <section class="wallet-section notifications-panel">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">系统通知</h3>
        </div>
        <div v-if="pendingActions" class="wb-card-head__actions">
          <span class="notifications-pending">
            <TIcon :icon="Bell" />
            待我处理 {{ pendingActions }}
          </span>
        </div>
      </div>

      <div v-if="warningError" class="notifications-warning" role="alert">
        <span>评论警告加载失败：{{ warningError }}</span>
        <TButton variant="outline" @click="loadNotifications()">重试</TButton>
      </div>

      <NotificationsToolbar
        v-if="cards.length || filtersActive"
        v-model:kind-filter="kindFilter"
        v-model:keyword="keyword"
        :options="kindFilters"
        :total="cards.length"
        :filtered-total="filteredTotal"
        :active="filtersActive"
        @reset="resetFilters"
      />

      <p v-if="loading && !cards.length" class="wb-empty" role="status">系统通知加载中…</p>
      <NotificationsEmptyState
        v-else-if="!filteredCards.length"
        :title="emptyTitle()"
        :active="filtersActive"
        @reset="resetFilters"
      />
      <template v-else>
        <ul class="wb-list" aria-label="系统通知列表">
          <NotificationCardItem
            v-for="card in displayCards"
            :key="card.key"
            :card="card"
            :voting-id="votingId"
            :responding-transfer-id="respondingTransferId"
            @vote="vote(card, $event)"
            @respond="respondTransfer(card, $event)"
            @cancel="cancelTransfer(card)"
            @open="openAnnouncement(card)"
          />
        </ul>
        <NotificationsPager
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="filteredTotal"
        />
      </template>
    </section>
  </main>
</template>

<style scoped>
/* 类别色与中性色都在这里下发：根元素定义 --nc-*，各构件只引用变量、不写色值。
   变量值与原页面逐条一致（含 color-mix 的合成基色），换名不改色。 */
.notifications-page {
  --nc-accent-default: var(--73-ink-muted);
  --nc-accent-comment-warning: var(--73-warning);
  --nc-accent-history-disclosure: var(--73-accent);
  --nc-accent-resource-transfer: var(--73-success);
  --nc-accent-after-sales: var(--73-danger);
  --nc-accent-announcement: var(--73-accent);
  --nc-surface: var(--73-surface-strong);
  --nc-text-sub: var(--profile-text-sub, var(--73-ink-muted));
  --nc-text-muted: var(--profile-text-sub, var(--73-ink-placeholder));
  --nc-pending-border: color-mix(in srgb, var(--73-warning) 20%, transparent);
  --nc-pending-bg: color-mix(in srgb, var(--73-warning) 9%, transparent);
  --nc-pending-text: var(--73-warning);
  --nc-empty-icon-bg: color-mix(in srgb, var(--73-ink-placeholder) 12%, transparent);
  --nc-empty-icon-text: var(--73-ink-placeholder);
  --nc-warning-text: var(--profile-warning-text, var(--73-warning-text));

  align-content: start;
}

/* 卡头右侧的「待我处理」计数：与读数条呼应，提醒这一页有动作要做 */
.notifications-pending {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 11px;
  border: 1px solid var(--nc-pending-border);
  border-radius: 999px;
  background: var(--nc-pending-bg);
  color: var(--nc-pending-text);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

/* 评论警告拉取失败时的提示条：只提示这一类，其余通知照常显示 */
.notifications-warning {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--dev-gold) 32%, transparent);
  border-radius: var(--wb-radius-item);
  background: color-mix(in srgb, var(--dev-gold) 10%, transparent);
  color: var(--nc-warning-text);
  font-size: 13px;
}

/* 列表像会话一样贴底：面板撑满顶栏以下的一屏，搜索留在上方，通知压到底部，最新一条最靠近底边 */
@media (max-width: 900px) {
  .notifications-panel {
    display: flex;
    flex-direction: column;
    /* 扣掉顶栏以上 73px，以及底部给快捷导航让出的 80px + 内容区下内边距 22px（见 App.vue），
       一屏放得下时外层不出滚动，搜索框不会被滚出去 */
    min-height: calc(100dvh - 73px - 102px);
  }

  .notifications-panel > .wb-list,
  .notifications-panel > .wb-empty {
    margin-top: auto;
  }
}

@media (max-width: 640px) {
  .notifications-pending {
    display: none;
  }
}
</style>
