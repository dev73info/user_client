<script setup lang="ts">
/**
 * R010 开发者工作台「打赏设置」页。
 *
 * 两块内容：
 * 1. 打赏设置：总开关、现金档位（1–6 档，元）、是否允许自填与上下限、打赏页感谢语（≤100 字）、
 *    是否公开打赏记录；保存前做与后端同口径的本地校验（见 `@/shared/devTip`）。
 * 2. 收到打赏：本人收到的打赏只读列表（含未公开的），金额、状态、留言、匿名、时间。
 *
 * 只有现金一种形态：契约 `TipConfigResponse` 没有积分档位、没有分通道开关，也没有结算账户
 * 标记与平台服务费基点，所以读数条只留「打赏状态 / 累计现金」两项，不再显示积分与服务费。
 *
 * 取数、表单与校验在 `useDevTipSettings`；表单与列表分别是 `DevTipSettingsForm` /
 * `DevReceivedTipsCard`，本页只留读数条与两个卡片挂点。
 */
import { useDevTipSettings } from '@/composables/useDevTipSettings'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'

import { Refresh, TButton, TCard, TIcon } from 'ui_73info'
import DevReceivedTipsCard from '@/components/dev/DevReceivedTipsCard.vue'
import DevTipSettingsForm from '@/components/dev/DevTipSettingsForm.vue'

const { loading, saving, form, received, receivedLoading, receivedCashText, save, refreshAll } =
  useDevTipSettings()
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
          <span class="dev-meta-strip__value">{{ receivedLoading ? '—' : receivedCashText }}</span>
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

    <TCard class="dev-surface-card">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">打赏设置</h3>
        </div>
      </div>

      <DevTipSettingsForm
        v-model:enabled="form.enabled"
        v-model:cash-tiers="form.cashTiers"
        v-model:allow-custom-cash="form.allowCustomCash"
        v-model:custom-cash-min="form.customCashMin"
        v-model:custom-cash-max="form.customCashMax"
        v-model:thanks-message="form.thanksMessage"
        v-model:public-records="form.publicRecords"
        :saving="saving"
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
