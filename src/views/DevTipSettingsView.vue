<script setup lang="ts">
/**
 * R010 开发者工作台「打赏设置」页。
 *
 * 两块内容：
 * 1. 打赏设置：总开关、现金 / 积分通道开关、现金档位（1–6 档，元）、积分档位（1–6 档）、
 *    是否允许自填与各自的上下限、打赏页感谢语（≤100 字）、是否公开打赏记录；
 *    保存前做与后端同口径的本地校验（见 `@/shared/devTip`）。
 * 2. 收到打赏：本人收到的打赏只读列表（含未公开的），现金 / 积分、金额、状态、留言、匿名、时间。
 *
 * 现金打赏要求开发者已绑定可用的 Adapay 结算账户；`settlement_ready=false` 时页面顶部提示
 * 「先绑结算账户」并给出入口。
 *
 * 取数、表单与校验在 `useDevTipSettings`；表单与列表分别是 `DevTipSettingsForm` /
 * `DevReceivedTipsCard`，本页只留读数条、结算账户提示与两个卡片挂点。
 */
import { useRouter } from 'vue-router'

import { useDevTipSettings } from '@/composables/useDevTipSettings'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { fenToYuanText } from '@/shared/resourceSale'

import { Refresh, TAlert, TButton, TCard, TIcon } from 'ui_73info'
import DevReceivedTipsCard from '@/components/dev/DevReceivedTipsCard.vue'
import DevTipSettingsForm from '@/components/dev/DevTipSettingsForm.vue'

const router = useRouter()

const {
  loading,
  saving,
  settingsLoaded,
  settlementReady,
  noticeText,
  form,
  received,
  receivedLoading,
  feePercentText,
  receivedCashTotal,
  receivedPointsTotal,
  save,
  refreshAll,
} = useDevTipSettings()

function goBindSettlementAccount() {
  void router.push({ name: 'dev-wallet' })
}
</script>

<template>
  <div class="dev-page dev-page--tip-settings">
    <WorkbenchBarSlot>
      <div class="dev-meta-strip">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">打赏状态</span>
          <span class="dev-meta-strip__value">{{ form.enabled ? '已开启' : '未开启' }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">累计现金</span>
          <span class="dev-meta-strip__value">{{
            receivedLoading ? '—' : `¥${fenToYuanText(receivedCashTotal)}`
          }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">累计积分</span>
          <span class="dev-meta-strip__value">{{
            receivedLoading ? '—' : receivedPointsTotal
          }}</span>
        </div>
        <div class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">平台服务费</span>
          <span class="dev-meta-strip__value">{{ feePercentText }}</span>
        </div>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton
            icon-only
            :loading="loading || receivedLoading"
            aria-label="刷新打赏数据"
            @click="refreshAll"
          >
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </div>
    </WorkbenchBarSlot>

    <!-- 未绑结算账户：现金打赏不可用，给出明确入口 -->
    <TAlert
      v-if="settingsLoaded && !settlementReady"
      tone="warning"
      show-icon
      title="尚未绑定可用的结算账户"
      description="现金打赏需要先绑定 Adapay 结算账户才能向你结算；未绑定时他人无法用现金打赏。积分打赏不受影响。"
      class="tip-settings__alert"
    >
      <template #actions>
        <TButton variant="outline" tone="accent" @click="goBindSettlementAccount">
          去绑定结算账户
        </TButton>
      </template>
    </TAlert>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">打赏设置</h3>
        </div>
      </div>

      <DevTipSettingsForm
        v-model:enabled="form.enabled"
        v-model:cash-enabled="form.cashEnabled"
        v-model:points-enabled="form.pointsEnabled"
        v-model:cash-tiers="form.cashTiers"
        v-model:points-tiers="form.pointsTiers"
        v-model:allow-custom-cash="form.allowCustomCash"
        v-model:custom-cash-min="form.customCashMin"
        v-model:custom-cash-max="form.customCashMax"
        v-model:allow-custom-points="form.allowCustomPoints"
        v-model:custom-points-min="form.customPointsMin"
        v-model:custom-points-max="form.customPointsMax"
        v-model:thanks-message="form.thanksMessage"
        v-model:public-records="form.publicRecords"
        :saving="saving"
        :notice-text="noticeText"
        @save="save"
      />
    </TCard>

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">收到打赏</h3>
        </div>
      </div>

      <DevReceivedTipsCard :received="received" :received-loading="receivedLoading" />
    </TCard>
  </div>
</template>

<style scoped>
/* 结算账户提示条：TAlert 自带 actions 槽位，按钮排在文案右侧、竖向居中。
   这里只给它一个外边距，形状与配色都走组件自己的语义（tone=warning）。 */
.tip-settings__alert {
  margin-bottom: 0;
}
</style>
