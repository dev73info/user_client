<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Promotion, TButton, TIcon } from 'ui_73info'

import PointsLogList from '@/components/points/PointsLogList.vue'
import PointsRecordToolbar from '@/components/points/PointsRecordToolbar.vue'
import PointsRewardCard from '@/components/points/PointsRewardCard.vue'
import PointsTransferList from '@/components/points/PointsTransferList.vue'
import WorkbenchPageHeader from '@/components/workbench/WorkbenchPageHeader.vue'
import { usePointsCenter } from '@/composables/usePointsCenter'
import { pointsLogDeltaLabel, pointsLogTitle, pointsTransferStatusLabel } from '@/shared/pointsDisplay'

/**
 * 积分中心（基准稿：用户工作台 · 资产与权益 · 积分中心）。
 *
 * 页头（面包屑 / 标题 / 动作）→ 三张指标卡 → 明细与打赏记录（页签 + 筛选 + 表格 + 分页）
 * → 发起积分打赏（页内表单 + 实时结算）。数据全部来自 `usePointsCenter`。
 */
const router = useRouter()

const {
  auth,
  refreshing,
  activeRecordTab,
  refreshOverview,
  loading,
  error,
  checkinError,
  transferError,
  metaError,
  loadCheckin,
  loadTransfers,
  loadTransferMeta,
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
  transferTo,
  transferAmount,
  transferNote,
  transferSaving,
  transferMeta,
  feeRate,
  transferKeyword,
  transferScope,
  transferScopes,
  transferFiltersActive,
  transferPage,
  transferPageSize,
  transferTotal,
  pagedTransfers,
  filteredTransfers,
  resetTransferFilters,
  resetTransferForm,
  submitTransfer,
  checkinStatus,
  checkinSaving,
  checkin,
} = usePointsCenter()

const rewardCardRef = ref<InstanceType<typeof PointsRewardCard> | null>(null)

const receivedCount = computed(
  () => transfers.value.filter((item) => item.to_username === auth.username).length,
)
const sentCount = computed(
  () => transfers.value.filter((item) => item.from_username === auth.username).length,
)
const lastLogTime = computed(() => logs.value[0]?.created_at ?? '—')

function focusReward() {
  rewardCardRef.value?.scrollToCard()
}

/** 签到 / 打赏 / 打赏规则三类加载失败共用一条提示；重试只重跑失败的那一条。 */
function retryFailed() {
  if (checkinError.value) {
    void loadCheckin()
    return
  }
  if (transferError.value) {
    void loadTransfers()
    return
  }
  void loadTransferMeta()
}

function csvCell(value: unknown) {
  return '"' + String(value ?? '').replace(/"/g, '""') + '"'
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 导出当前页签已加载的数据：字段与表格列一一对应。 */
function exportRecords() {
  if (activeRecordTab.value === 'logs') {
    downloadCsv('points-logs.csv', [
      ['变动时间', '变动原因', '变动值', '变动后余额', '流水号'],
      ...logs.value.map((row) => [
        row.created_at,
        pointsLogTitle(row),
        pointsLogDeltaLabel(row.delta),
        String(row.balance_after),
        String(row.id),
      ]),
    ])
    return
  }

  downloadCsv('points-transfers.csv', [
    ['变动时间', '发起人', '接收人', '打赏积分', '手续费', '对方到账', '审核态', '附言'],
    ...filteredTransfers.value.map((row) => [
      row.created_at,
      row.from_username,
      row.to_username,
      String(row.amount),
      String(row.fee),
      String(row.received),
      pointsTransferStatusLabel(row),
      row.note ?? '',
    ]),
  ])
}
</script>

<template>
  <main class="page-shell points-page" :aria-busy="loading">
    <WorkbenchPageHeader
      title="积分中心"
      subtitle="查看平台积分账户余额、流转明细及开发者社区打赏记录"
      :breadcrumbs="[
        { label: '工作台', to: { name: 'workbench' } },
        { label: '资产与权益' },
        { label: '积分中心' },
      ]"
    >
      <template #actions>
        <TButton variant="text" @click="router.push({ name: 'mall' })">积分商城</TButton>
        <TButton
          variant="text"
          :loading="checkinSaving"
          :disabled="Boolean(checkinStatus?.today_checked_in)"
          @click="checkin"
        >
          {{
            checkinStatus?.today_checked_in
              ? `今日已签到 · 连续 ${checkinStatus.streak_count} 天`
              : '每日签到'
          }}
        </TButton>
        <TButton variant="solid" tone="accent" @click="focusReward">
          <TIcon><Promotion /></TIcon>
          <span>发起积分打赏</span>
        </TButton>
      </template>
    </WorkbenchPageHeader>

    <div v-if="checkinError || transferError || metaError" class="points-alert" role="alert">
      <span>{{ checkinError || transferError || metaError }}</span>
      <TButton variant="outline" @click="retryFailed">重试</TButton>
    </div>

    <section class="points-metrics" aria-label="积分概览">
      <article class="points-metric">
        <div class="points-metric__top">
          <span class="points-metric__label">
            <span class="points-metric__icon points-metric__icon--accent" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M3 10h18" />
                <path d="M16 15h2" />
              </svg>
            </span>
            可用积分余额
          </span>
        </div>
        <div class="points-metric__value">
          {{ loading ? '—' : pointsBalance }}<small>PTS</small>
        </div>
        <div class="points-metric__foot">
          <span v-if="checkinStatus">今日签到可得 {{ checkinStatus.today_potential }} PTS</span>
          <span v-else>积分可在积分商城兑换权益与道具卡</span>
        </div>
      </article>

      <article class="points-metric">
        <div class="points-metric__top">
          <span class="points-metric__label">
            <span class="points-metric__icon points-metric__icon--warning" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 17 6.5 20l1-5.5L3 10.5l5.5-.5L11 5l2.5 5 5.5.5-4.5 4 1 5.5Z" />
              </svg>
            </span>
            打赏记录总数
          </span>
        </div>
        <div class="points-metric__value">
          {{ transferLoading ? '—' : transferTotal }}<small>笔</small>
        </div>
        <div class="points-metric__foot">
          收到 {{ receivedCount }} 笔 · 支出 {{ sentCount }} 笔
        </div>
      </article>

      <article class="points-metric">
        <div class="points-metric__top">
          <span class="points-metric__label">
            <span class="points-metric__icon points-metric__icon--muted" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 3h9l4 4v14H6z" />
                <path d="M14 3v5h5" />
                <path d="M9 13h6M9 17h6" />
              </svg>
            </span>
            累计明细流水
          </span>
        </div>
        <div class="points-metric__value">
          {{ loading ? '—' : logTotal }}<small>条</small>
        </div>
        <div class="points-metric__foot">最后变动：{{ lastLogTime }}</div>
      </article>
    </section>

    <section class="points-records" aria-label="积分记录">
      <PointsRecordToolbar
        v-model:active-tab="activeRecordTab"
        v-model:scope="transferScope"
        v-model:keyword="transferKeyword"
        :scopes="transferScopes"
        :filters-active="transferFiltersActive"
        :filtered-total="transferTotal"
        :total-count="transfers.length"
        :log-total="logTotal"
        :transfer-total="transferTotal"
        :refreshing="refreshing"
        @reset="resetTransferFilters"
        @refresh="refreshOverview"
        @export="exportRecords"
      />

      <div
        :id="`points-records-panel-${activeRecordTab}`"
        class="points-records__panel"
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

    <PointsRewardCard
      ref="rewardCardRef"
      v-model:to="transferTo"
      v-model:amount="transferAmount"
      v-model:note="transferNote"
      :balance="pointsBalance"
      :fee-rate="feeRate"
      :daily-cap="transferMeta?.daily_cap ?? null"
      :manual-threshold="transferMeta?.manual_review_threshold ?? null"
      :saving="transferSaving"
      @submit="submitTransfer"
      @cancel="resetTransferForm"
    />

    <footer class="points-foot">
      73info.cn 开发者协作平台 · 积分中心流水由自动化记账系统维护
    </footer>
  </main>
</template>

<style scoped>
.points-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.points-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--73-warning-line);
  border-radius: 10px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 13px;
}

.points-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.points-metric {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--73-ink) 5%, transparent);
  transition: border-color var(--73-transition);
}

.points-metric:hover {
  border-color: var(--73-border-hover);
}

.points-metric__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.points-metric__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--73-ink-muted);
  font-size: 12px;
  font-weight: 500;
}

.points-metric__icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--73-inset);
  color: var(--73-ink-soft);
}

.points-metric__icon--accent {
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.points-metric__icon--warning {
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}

.points-metric__icon--muted {
  background: var(--73-inset);
  color: var(--73-ink-muted);
}

.points-metric__tag {
  padding: 2px 8px;
  border: 1px solid var(--73-border);
  border-radius: 4px;
  background: var(--73-inset);
  color: var(--73-ink-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.points-metric__tag--accent {
  border-color: var(--73-accent-line);
  background: var(--73-accent-soft);
  color: var(--73-accent);
}

.points-metric__tag--warning {
  border-color: var(--73-warning-line);
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
}

.points-metric__value {
  margin-top: 16px;
  color: var(--73-ink);
  font-family: var(--73-font-family-mono);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

.points-metric__value small {
  margin-left: 6px;
  color: var(--73-ink-placeholder);
  font-family: var(--73-font-family);
  font-size: 13px;
  font-weight: 600;
}

.points-metric__foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-muted);
  font-size: 12px;
}

.points-records {
  overflow: hidden;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--73-ink) 5%, transparent);
}

.points-records__panel {
  min-height: 220px;
}

.points-foot {
  padding: 8px 0 24px;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-placeholder);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 900px) {
  .points-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid var(--73-warning-line);
  border-radius: 10px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 13px;
}

.points-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
