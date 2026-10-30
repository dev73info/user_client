<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Promotion, TButton, TIcon } from 'ui_73info'

import PointsLogList from '@/components/points/PointsLogList.vue'
import PointsRecordToolbar from '@/components/points/PointsRecordToolbar.vue'
import PointsSummaryStrip from '@/components/points/PointsSummaryStrip.vue'
import PointsTransferDialog from '@/components/points/PointsTransferDialog.vue'
import PointsTransferList from '@/components/points/PointsTransferList.vue'
import { usePointsCenter } from '@/composables/usePointsCenter'

const router = useRouter()
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
  transferError,
  metaError,
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
  loadTransfers,
  loadTransferMeta,
  submitTransfer,
  checkinStatus,
  checkinSaving,
  checkinError,
  loadCheckin,
  checkin,
} = usePointsCenter()
</script>

<template>
  <main class="page-shell custom-page-shell profile-page points-page wb-sheet" :aria-busy="loading">
    <PointsSummaryStrip
      :loading="loading"
      :transfer-loading="transferLoading"
      :points-balance="pointsBalance"
      :transfer-count="transfers.length"
      :log-total="logTotal"
      :refreshing="refreshing"
      @refresh="refreshOverview"
    />
    <section class="wallet-section">
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">积分记录</h3>
        </div>
        <div class="wb-card-head__actions">
          <TButton variant="outline" @click="router.push({ name: 'mall' })">积分商城</TButton>
          <TButton
            variant="outline"
            :loading="checkinSaving"
            :disabled="checkinStatus?.today_checked_in"
            @click="checkin"
          >
            {{ checkinStatus?.today_checked_in ? '今日已签到' : '每日签到' }}
          </TButton>
          <TButton variant="solid" tone="accent" @click="transferDialogVisible = true">
            <TIcon><Promotion /></TIcon><span>积分打赏</span>
          </TButton>
        </div>
      </div>
      <div v-if="checkinError" class="wb-empty" role="alert">
        <span>{{ checkinError }}</span>
        <TButton variant="outline" @click="loadCheckin">重试</TButton>
      </div>
      <div v-if="transferError || metaError" class="wb-empty" role="alert">
        <span>{{ transferError || metaError }}</span>
        <TButton variant="outline" @click="transferError ? loadTransfers() : loadTransferMeta()">
          重试
        </TButton>
      </div>
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
@media (max-width: 640px) {
  .points-page .wb-card-head__actions {
    justify-content: flex-end;
  }
}
</style>
