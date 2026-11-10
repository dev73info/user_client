<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Promotion, Refresh, TButton, TDialog, TIcon } from 'ui_73info'

import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import PointsLogList from '@/components/points/PointsLogList.vue'
import PointsRewardCard from '@/components/points/PointsRewardCard.vue'
import WorkbenchPager from '@/components/workbench/WorkbenchPager.vue'
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
          <span class="wb-strip__value">{{ loading ? '—' : `${pointsBalance} PTS` }}</span>
        </div>
        <span class="wb-strip__divider" aria-hidden="true" />
        <div class="wb-strip__item">
          <span class="wb-strip__label">积分记录</span>
          <span class="wb-strip__value">{{ loading ? '—' : `${logTotal} 条` }}</span>
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
      <div class="wb-card-head">
        <div class="wb-card-head__title-block">
          <h3 class="wb-card-head__title">我的积分</h3>
        </div>
        <!-- 页面级动作挂在卡头右侧：桌面完整文案，≤640 收成纯文字胶囊 -->
        <div class="wb-card-head__actions points-records__actions">
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

      <p v-if="loading && !pagedLogs.length" class="wb-empty" role="status">
        正在加载积分记录…
      </p>
      <div v-else-if="error" class="wb-empty" role="alert">
        <span class="wb-empty__title">加载积分记录失败</span>{{ error }}
        <div class="wb-empty__actions">
          <TButton variant="outline" @click="loadPoints()">
            <TIcon><Refresh /></TIcon><span>重新加载</span>
          </TButton>
        </div>
      </div>
      <p v-else-if="!pagedLogs.length" class="wb-empty" role="status">
        <span class="wb-empty__title">暂无积分记录</span>
      </p>
      <template v-else>
        <PointsLogList :rows="pagedLogs" />
        <WorkbenchPager
          :total="logTotal"
          unit="条记录"
          :page="logPage"
          :page-size="logPageSize"
          pagination-aria-label="积分记录分页"
          @update:page="handleLogPageChange"
          @update:page-size="handleLogPageSizeChange"
        />
      </template>
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
  </main>
</template>

<style scoped>
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

.points-records__actions {
  flex-wrap: wrap;
}

.points-records__actions .points-reward--compact {
  display: none;
}

@media (max-width: 640px) {
  /* 触屏档：带「图标 + 文字」的完整按钮收起，打赏入口换成纯文字胶囊，比只留一枚火箭图标更容易认。 */
  .points-records__actions .points-reward--full {
    display: none;
  }

  .points-records__actions .points-reward--compact {
    display: inline-flex;
  }
}
</style>
