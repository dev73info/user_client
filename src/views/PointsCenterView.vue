<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Promotion, Refresh, TButton, TDialog, TIcon } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import PointsLogList from '@/components/points/PointsLogList.vue'
import PointsRewardCard from '@/components/points/PointsRewardCard.vue'
import { usePointsCenter } from '@/composables/usePointsCenter'

/**
 * 我的积分（基准稿：用户工作台 · 资产与权益 · 我的积分）。
 *
 * 页头（面包屑 / 标题 / 动作）→ 读数条 → 积分记录（统一列表 + 分页）
 * → 发起积分打赏（页内表单 + 实时结算）。数据全部来自 `usePointsCenter`。
 */
const {
  refreshing,
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
  transferTo,
  transferAmount,
  transferNote,
  transferSaving,
  transferDialogVisible,
  transferMeta,
  feeRate,
  transferTotal,
  resetTransferForm,
  submitTransfer,
  checkinStatus,
  checkinSaving,
  checkin,
} = usePointsCenter()

const rewardCardRef = ref<InstanceType<typeof PointsRewardCard> | null>(null)

/** 打赏表单在弹窗里：打开后把焦点放进接收方输入框。 */
function openReward() {
  transferDialogVisible.value = true
}

watch(transferDialogVisible, async (open) => {
  if (!open) return
  await nextTick()
  rewardCardRef.value?.focusRecipient()
})

function closeReward() {
  resetTransferForm()
  transferDialogVisible.value = false
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
</script>

<template>
  <main class="page-shell custom-page-shell profile-page points-page wb-sheet" :aria-busy="loading">
    <!-- 与同组菜单页同一版式：顶部读数条（读数 + 页面级动作），下面是一张纸。 -->
    <WorkbenchBarSlot>
      <div class="wb-strip" aria-label="积分概览">
        <div class="wb-strip__item">
          <span class="wb-strip__label">可用积分</span>
          <span class="wb-strip__value">{{ loading ? '—' : pointsBalance }} PTS</span>
        </div>
        <div class="wb-strip__divider" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">积分记录</span>
          <span class="wb-strip__value">{{ loading ? '—' : logTotal }} 条</span>
          <span class="wb-strip__tag">含打赏 {{ transferLoading ? '—' : transferTotal }} 笔</span>
        </div>
        <div class="wb-strip__item wb-strip__action">
          <TButton
            icon-only
            :loading="refreshing"
            aria-label="刷新积分数据"
            @click="refreshOverview"
          >
            <TIcon><Refresh /></TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <div v-if="checkinError || transferError || metaError" class="points-alert" role="alert">
      <span>{{ checkinError || transferError || metaError }}</span>
      <TButton variant="outline" @click="retryFailed">重试</TButton>
    </div>

    <section class="wallet-section points-records" aria-label="积分记录">
      <div class="wb-toolbar points-records__toolbar">
        <span class="wb-toolbar__hint">签到、打赏与兑换都会记入同一份积分流水</span>
        <div class="wb-toolbar__actions">
          <TButton
            variant="outline"
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
          <TButton class="points-reward--full" variant="solid" tone="accent" @click="openReward">
            <TIcon><Promotion /></TIcon>
            <span>发起积分打赏</span>
          </TButton>
          <TButton class="points-reward--compact" variant="solid" tone="accent" @click="openReward">
            积分打赏
          </TButton>
        </div>
      </div>
      <PointsLogList
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
    </section>

    <TDialog
      v-model:open="transferDialogVisible"
      title="发起积分打赏"
      width="760px"
      class="points-reward-dialog"
      :mask-closable="!transferSaving"
    >
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
        flat
        hide-head
        @submit="submitTransfer"
        @cancel="closeReward"
      />
    </TDialog>

    <footer class="points-foot">73info.cn 开发者协作平台 · 积分记录由自动化记账系统维护</footer>
  </main>
</template>

<style scoped>
.points-page {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.points-alert {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding: 12px 16px;
  border: 1px solid var(--73-warning-line);
  border-radius: 10px;
  background: var(--73-warning-soft);
  color: var(--73-warning-text);
  font-size: 13px;
}

.points-records {
  overflow: hidden;
  border: 1px solid var(--73-border);
  border-radius: 12px;
  background: var(--73-surface);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--73-ink) 5%, transparent);
}
/* 记录表自己带 20px 行内边距，作为纸身不再叠一层纸壳内边距 */
.points-page > .points-records {
  margin-top: 0;
  padding: 0;
}

.points-records__toolbar {
  margin: 0;
  padding: 14px 20px;
  border-bottom: 1px solid var(--73-border-soft);
}

.points-records__toolbar .wb-toolbar__actions {
  flex-wrap: wrap;
}

.points-records__toolbar .points-reward--compact {
  display: none;
}

@media (max-width: 640px) {
  /* 触屏档工作台会把「图标 + 文字」的工具栏按钮收成纯图标；打赏入口换成纯文字胶囊，
     比只留一枚火箭图标更容易认。 */
  .points-records__toolbar .points-reward--compact {
    display: inline-flex;
  }
}

.points-foot {
  padding: 8px 0 24px;
  border-top: 1px solid var(--73-border-soft);
  color: var(--73-ink-placeholder);
  font-size: 12px;
  text-align: center;
}
</style>
