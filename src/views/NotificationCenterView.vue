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

/* 「系统通知」：公开申请、解除合作案件与本人评论警告统一成同一种消息卡片。
   数据、筛选与动作在 composables 里（useNotificationCenter / useNotificationCardActions），
   本文件只摆版面：读数条 → 卡头 → 提示条 → 工具栏 → 列表 / 空态 / 分页。

   两个工作台共用这一页（用户端 workbench-notifications / 开发者端 dev-notifications），
   与消息中心同一办法：页面根元素按 isDevWorkbench 在两套统一层之间切，
   不写「近似」对方的覆盖样式；类别色由根元素上的 --nc-* 令牌下发，各构件只引用变量。 */
const {
  isDevWorkbench,
  loading,
  cards,
  cardsTotal,
  commentWarningsError,
  commentWarningsLoading,
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
  loadCommentWarnings,
  loadDisclosures,
} = useNotificationCenter()

const { votingId, vote } = useNotificationCardActions({
  refreshDisclosures: loadDisclosures,
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
    <!-- 顶部读数条：两端共用用户工作台这一层（.wb-strip） -->
    <WorkbenchBarSlot>
      <NotificationsOverviewStrip
        :loading="loading"
        :total="cardsTotal"
        :pending="pendingActions"
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

      <section v-if="commentWarningsError" class="wb-empty notifications-load-error" role="alert">
        <div class="notifications-load-error__copy">
          <strong>评论警告加载失败</strong>
          <p>{{ commentWarningsError }}</p>
        </div>
        <TButton variant="outline" :loading="commentWarningsLoading" @click="loadCommentWarnings">
          重新加载
        </TButton>
      </section>

      <p v-if="loading && !cards.length" class="wb-empty" role="status">系统通知加载中…</p>
      <NotificationsEmptyState
        v-else-if="!filteredCards.length && !commentWarningsError"
        :title="emptyTitle()"
        :active="filtersActive"
        @reset="resetFilters"
      />
      <template v-else-if="filteredCards.length">
        <ul class="wb-list" aria-label="系统通知列表">
          <NotificationCardItem
            v-for="card in displayCards"
            :key="card.key"
            :card="card"
            :voting-id="votingId"
            @vote="vote(card, $event)"
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
  --nc-accent-history-disclosure: var(--73-accent);
  --nc-accent-after-sales: var(--73-danger);
  --nc-accent-comment-warning: var(--73-warning);
  --nc-surface: var(--73-surface-strong);
  --nc-text-sub: var(--profile-text-sub, var(--73-ink-muted));
  --nc-text-muted: var(--profile-text-sub, var(--73-ink-placeholder));
  --nc-pending-border: color-mix(in srgb, var(--73-warning) 20%, transparent);
  --nc-pending-bg: color-mix(in srgb, var(--73-warning) 9%, transparent);
  --nc-pending-text: var(--73-warning);
  --nc-empty-icon-bg: color-mix(in srgb, var(--73-ink-placeholder) 12%, transparent);
  --nc-empty-icon-text: var(--73-ink-placeholder);

  align-content: start;
}

/* 用户工作台的内容区本身已经是一张 22px 圆角的大卡。
   这里不再让读数条、通知面板和空态各套一层卡，改成同一张卡里的三段式层级：
   顶部读数带 → 面板标题 → 居中空态 / 列表。开发者工作台继续沿用 dev-page。 */
.notifications-page:not(.dev-page) {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.notifications-page:not(.dev-page) :deep(.wb-strip) {
  flex: 0 0 auto;
  padding: 14px 24px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--73-accent-soft) 92%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--73-accent-soft) 24%, transparent);
  box-shadow: none;
}

.notifications-page:not(.dev-page) > .notifications-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 22px 24px 24px;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.notifications-page:not(.dev-page) > .notifications-panel :deep(.notifications-empty) {
  flex: 1 1 auto;
  min-height: 260px;
  justify-content: center;
  border: 0;
  background: transparent;
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

.notifications-load-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.notifications-load-error__copy p {
  margin: 4px 0 0;
  color: var(--73-danger);
}

/* 列表像会话一样贴底：面板撑满顶栏以下的一屏，搜索留在上方，通知压到底部，最新一条最靠近底边 */
@media (max-width: 900px) {
  .notifications-page:not(.dev-page) {
    min-height: 100%;
  }

  .notifications-page:not(.dev-page) > .notifications-panel {
    min-height: 0;
    padding: 18px 16px 24px;
  }
}

@media (max-width: 640px) {
  .notifications-pending {
    display: none;
  }

  .notifications-load-error {
    flex-direction: column;
    text-align: center;
  }

  .notifications-load-error :deep(.t73-button) {
    min-height: 44px;
  }
}
</style>
