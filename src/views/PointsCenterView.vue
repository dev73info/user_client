<script setup lang="ts">
/**
 * 我的背包 → 积分中心：余额读数、积分记录（打赏记录 / 积分明细两段切换）、积分打赏弹窗。
 *
 * 这一页只负责排版与组合：
 * - 取数、两段记录的分页与筛选、打赏弹窗与提交 → `usePointsCenter`；
 * - 顶部读数条 → `PointsSummaryStrip`；
 * - 记录区的两段切换与打赏段筛选 → `PointsRecordToolbar`；
 * - 打赏记录 / 积分明细两段 → `PointsTransferList` / `PointsLogList`；
 * - 打赏弹窗 → `PointsTransferDialog`；
 * - 行文案、徽标与金额换算 → `@/shared/pointsDisplay`。
 *
 * 权益（佩戴与用户名颜色）已拆到「权益中心」、券包已拆到「优惠券中心」、评论警告已移到
 * 「系统通知」，这一页不再一屏铺四件事。
 */
import { Promotion, TButton, TIcon } from 'ui_73info'

import PointsLogList from '@/components/points/PointsLogList.vue'
import PointsRecordToolbar from '@/components/points/PointsRecordToolbar.vue'
import PointsSummaryStrip from '@/components/points/PointsSummaryStrip.vue'
import PointsTransferDialog from '@/components/points/PointsTransferDialog.vue'
import PointsTransferList from '@/components/points/PointsTransferList.vue'
import { usePointsCenter } from '@/composables/usePointsCenter'

const {
  auth,
  refreshing,
  activeRecordTab,
  refreshOverview,
  loading,
  error,
  logs,
  pointsBalance,
  pagedLogs,
  logPage,
  logPageSize,
  logTotal,
  loadPoints,
  handleLogPageChange,
  handleLogPageSizeChange,
  transferLoading,
  transfers,
  transferDialogVisible,
  transferTo,
  transferAmount,
  transferNote,
  transferSaving,
  feeRate,
  transferKeyword,
  transferScope,
  transferScopes,
  transferFiltersActive,
  transferPage,
  transferPageSize,
  transferTotal,
  pagedTransfers,
  resetTransferFilters,
  resetTransferForm,
  submitTransfer,
} = usePointsCenter()
</script>

<template>
  <main class="page-shell custom-page-shell profile-page points-page" :aria-busy="loading">
    <!-- 顶部读数条：读数在最左，页面级刷新固定在右上角 -->
    <PointsSummaryStrip
      :loading="loading"
      :transfer-loading="transferLoading"
      :points-balance="pointsBalance"
      :transfer-count="transfers.length"
      :log-total="logTotal"
      :refreshing="refreshing"
      @refresh="refreshOverview"
    />

    <!-- 打赏表单不再常驻占一屏：入口在「积分记录」卡头右侧，表单收进弹窗（见文件末尾）。
         这一页因此只留读数条与记录卡片两块。 -->
    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">积分记录</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="solid" tone="accent" @click="transferDialogVisible = true">
            <TIcon><Promotion /></TIcon><span>积分打赏</span>
          </TButton>
        </div>
      </div>

      <!-- 打赏记录与积分明细是同一份数据的两个视角（一笔打赏两边各记一次），
           合成一张卡片用胶囊切换，省掉一个卡头与一层留白。
           两段各有自己的筛选与分页，切 tab 只切显示、不重新请求。 -->
      <PointsRecordToolbar
        v-model:active-tab="activeRecordTab"
        v-model:scope="transferScope"
        v-model:keyword="transferKeyword"
        :scopes="transferScopes"
        :filters-active="transferFiltersActive"
        :filtered-total="transferTotal"
        :total-count="transfers.length"
        @reset="resetTransferFilters"
      />

      <div
        :id="`points-records-panel-${activeRecordTab}`"
        class="points-records__panel"
        :class="`points-records__panel--${activeRecordTab}`"
        role="tabpanel"
        :aria-labelledby="`points-records-tab-${activeRecordTab}`"
      >
        <PointsTransferList
          v-if="activeRecordTab === 'transfers'"
          v-model:page="transferPage"
          v-model:page-size="transferPageSize"
          :loading="transferLoading"
          :rows="pagedTransfers"
          :total="transferTotal"
          :all-count="transfers.length"
          :username="auth.username"
        />
        <PointsLogList
          v-else
          :loading="loading"
          :error="error"
          :rows="pagedLogs"
          :all-count="logs.length"
          :page="logPage"
          :page-size="logPageSize"
          :total="logTotal"
          @reload="loadPoints()"
          @page-change="handleLogPageChange"
          @page-size-change="handleLogPageSizeChange"
        />
      </div>
    </section>

    <PointsTransferDialog
      v-model:open="transferDialogVisible"
      v-model:to="transferTo"
      v-model:amount="transferAmount"
      v-model:note="transferNote"
      :saving="transferSaving"
      :fee-rate="feeRate"
      @submit="submitTransfer"
      @closed="resetTransferForm"
    />
  </main>
</template>

<style scoped>
/* 版式走统一层（.wb-strip / .wb-card-head / .wb-toolbar / .wb-chip / .wb-list / .wb-pager / .wb-empty / .wb-badge），
   本页只留卡头一处窄屏对齐：记录区两段筛选的竖线随工具栏、打赏弹窗的表单随弹窗一起搬走。 */

@media (max-width: 640px) {
  /* 卡头在窄屏改纵向，统一层的 __actions 给的是 space-between；
     这里只有一个入口按钮，会因此贴到左边，与「入口靠右」的定位不符 */
  .points-page .wb-card-head__actions {
    justify-content: flex-end;
  }
}
</style>
