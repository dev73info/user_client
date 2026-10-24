<script setup lang="ts">
/**
 * 需求大厅（门户 `/requirement-hall`）。
 *
 * 这一页只负责排版与组合：
 * - 列表、服务端分页、担保方式筛选、关键词本地过滤、侧栏读数、页面 SEO → `useRequirementHall`；
 * - 需求详情浮层（含 URL 里 `requirement_id` / `view` 自动开）→ `useRequirementHallDetail`；
 * - 「发布需求」弹窗与 `?modal=publish` 这条 query → `useRequirementHallPublish`；
 * - 工具栏 → `RequirementHallToolbar`；卡片 → `RequirementHallCard`；
 * - 右侧栏（大厅概览 + 最近交付）→ `RequirementHallAside`；
 * - 详情浮层 → `RequirementHallDetailDialog`（富文本排版在 `RequirementHallRichText`）；
 * - 状态 / 发布方式 / 金额与时间格式、筛选与统计口径 → `@/shared/requirementDisplay`。
 */
import { TPagination } from 'ui_73info'

import PublishModal from '@/components/PublishModal.vue'
import RequirementHallAside from '@/components/requirement/RequirementHallAside.vue'
import RequirementHallCard from '@/components/requirement/RequirementHallCard.vue'
import RequirementHallDetailDialog from '@/components/requirement/RequirementHallDetailDialog.vue'
import RequirementHallToolbar from '@/components/requirement/RequirementHallToolbar.vue'
import { HALL_PAGE_SIZE, useRequirementHall } from '@/composables/useRequirementHall'
import { useRequirementHallDetail } from '@/composables/useRequirementHallDetail'
import { useRequirementHallPublish } from '@/composables/useRequirementHallPublish'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

const {
  loading,
  overviewLoading,
  requirements,
  hallPage,
  hallTotal,
  keyword,
  guaranteeFilter,
  guaranteeOptions,
  filteredRequirements,
  resetKeyword,
  onGuaranteeFilterChange,
  resetHallFilters,
  hallStats,
  hallEmptyTitle,
  recentDeals,
  showHallSkeleton,
  hallRefreshing,
  loadHallData,
} = useRequirementHall()

/* 详情弹窗借大厅的列表与加载态：列表换过一轮后再按 URL 开详情（原 `loadHallData` 末尾那一步）。 */
const {
  selectedRequirement,
  selectedRequirementDescriptionHtml,
  selectedRequirementAcceptanceHtml,
  canOpenWorkbench,
  openRequirementDetail,
  closeRequirementDetail,
  openRequirementWorkbench,
} = useRequirementHallDetail({ requirements, loading })

/* 发布成功后重新拉一遍大厅：与原来 `await loadHallData()` 同一口径。 */
const {
  publishVisible,
  publishLoading,
  publishModalRef,
  publishTitle,
  publishDescription,
  publishBudget,
  publishAcceptance,
  publishPaymentMode,
  // 担保模式才显示的「开发周期（天）」：与付款模式同一路 v-model，缺了它用户填的周期会被丢掉。
  publishDevelopmentCycleDays,
  openPublishModal,
  closePublishModal,
  submitPublishRequirement,
  notify,
} = useRequirementHallPublish({ reloadHall: loadHallData })
</script>

<template>
  <main class="portal-page portal-page--nav">
    <section class="portal-page__content">
      <!-- 面板不再整块遮罩：首次加载由骨架屏顶上，后续刷新只压暗结果区就地替换。
           `aria-busy` 保留原有的无障碍语义。 -->
      <section
        class="portal-page__panel"
        :class="{ 'requirement-hall__panel--refreshing': hallRefreshing }"
        :aria-busy="loading ? 'true' : undefined"
      >
        <RequirementHallToolbar
          v-model:keyword="keyword"
          :guarantee-filter="guaranteeFilter"
          :options="guaranteeOptions"
          :loading="loading"
          :overview-loading="overviewLoading"
          @guarantee-change="onGuaranteeFilterChange"
          @clear-keyword="resetKeyword"
          @publish="openPublishModal"
          @refresh="loadHallData()"
        />

        <!-- 骨架屏只在「第一次进页面、还没有任何内容」时出场。
             之后刷新（含切页、切筛选）都保留当前列表，避免整个容器被清空重画。 -->
        <div v-if="showHallSkeleton" class="portal-page__card-grid requirement-hall__grid">
          <article
            v-for="item in 4"
            :key="item"
            class="portal-page__card portal-page__resource-skeleton"
          >
            <span class="portal-page__skeleton-chip"></span>
            <span class="portal-page__skeleton-title"></span>
            <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
            <span class="portal-page__skeleton-line"></span>
            <span class="portal-page__skeleton-action"></span>
          </article>
        </div>

        <div
          v-else-if="filteredRequirements.length"
          class="portal-page__card-grid requirement-hall__grid"
        >
          <RequirementHallCard
            v-for="card in filteredRequirements"
            :key="card.requirement_id"
            :card="card"
            :authed="auth.isAuthed"
            @open="openRequirementDetail"
          />
        </div>

        <div v-else class="portal-page__empty portal-page__empty--stacked">
          <strong>{{ hallEmptyTitle }}</strong>
          <button
            v-if="keyword.trim() || guaranteeFilter !== 'all'"
            class="portal-page__secondary"
            type="button"
            @click="resetHallFilters"
          >
            清空筛选
          </button>
        </div>

        <TPagination
          v-if="filteredRequirements.length"
          class="requirement-hall__pager"
          :current-page="hallPage"
          :page-size="HALL_PAGE_SIZE"
          :total="hallTotal"
          @current-change="loadHallData"
        />
      </section>

      <aside class="portal-page__aside">
        <RequirementHallAside :stats="hallStats" :deals="recentDeals" />
      </aside>
    </section>
  </main>

  <PublishModal
    ref="publishModalRef"
    :visible="publishVisible"
    v-model:publishTitle="publishTitle"
    v-model:publishDescription="publishDescription"
    v-model:publishBudget="publishBudget"
    v-model:publishAcceptance="publishAcceptance"
    v-model:publishPaymentMode="publishPaymentMode"
    v-model:publishDevelopmentCycleDays="publishDevelopmentCycleDays"
    :publishLoading="publishLoading"
    :draft-scope="auth.isAuthed ? auth.username : 'default'"
    @close="closePublishModal"
    @notify="notify"
    @submit="submitPublishRequirement"
  />

  <RequirementHallDetailDialog
    :requirement="selectedRequirement"
    :description-html="selectedRequirementDescriptionHtml"
    :acceptance-html="selectedRequirementAcceptanceHtml"
    :can-claim="canOpenWorkbench"
    @close="closeRequirementDetail"
    @open-workbench="openRequirementWorkbench"
  />
</template>

<style scoped>
/* 就地刷新：不动布局、不清空容器，只把结果区整体压暗一点，新数据回来自然复原。
   过渡写在常态上，所以「压暗」与「复原」两个方向都是渐变的，不会闪一下。
   分页器是子组件，根节点有没有本文件的 scope id 取决于它是否透传 attrs，所以用 :deep() 兜住。 */
.requirement-hall__grid,
.portal-page__empty,
.portal-page__panel :deep(.requirement-hall__pager) {
  transition: opacity 180ms ease;
}

.requirement-hall__panel--refreshing .requirement-hall__grid,
.requirement-hall__panel--refreshing .portal-page__empty,
.requirement-hall__panel--refreshing :deep(.requirement-hall__pager) {
  opacity: 0.55;
  /* 压暗期间不接受点击，免得点到马上要被替换掉的旧卡片 */
  pointer-events: none;
}

/* 工具栏始终留在原位、保持可用：刷新期间还能改关键词、切担保方式。 */

.requirement-hall__grid {
  align-items: stretch;
}

.requirement-hall__pager {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.portal-page__secondary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>
