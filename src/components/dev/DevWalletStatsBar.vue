<script setup lang="ts">
/**
 * 收益钱包页顶部读数条：累计收入 / 今日入账（带环比）/ 完成订单 / 活跃需求 + 刷新。
 *
 * 从 `DevWalletView` 抽出来时整条一条没改：四格读数都是页面那份 `overview` 的薄投影，
 * `WorkbenchBarSlot` 跟着一起搬（窄屏它把这整条搬进工作台顶栏），页面不再为这条留 40 行模板。
 */
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import type { DevWalletOverview } from '@/api/devWallet'
import { money } from '@/shared/devFundDisplay'
import { rateText } from '@/shared/devWalletDisplay'

import { TButton, TIcon, TLoading, TTag, Refresh } from 'ui_73info'

const props = defineProps<{
  /** 钱包总览；未加载到时各格按 0 展示（TLoading 期间本来就有遮罩） */
  overview: DevWalletOverview | null
  /** 收入池加载中（刷新按钮的转圈） */
  loading: boolean
  /** 保证金池加载中：与上一条共用同一个刷新按钮 */
  depositLoading: boolean
}>()

const emit = defineEmits<{
  /** 两个池子一起重拉 */
  refresh: []
}>()
</script>

<template>
  <WorkbenchBarSlot>
    <TLoading tag="div" class="dev-meta-strip" :loading="props.loading">
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">累计收入</span>
        <span class="dev-meta-strip__value">{{ money(props.overview?.total_income_cny) }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">今日入账</span>
        <span class="dev-meta-strip__value">{{ money(props.overview?.today_income_cny) }}</span>
        <TTag
          variant="outline"
          :tone="(props.overview?.today_income_change_rate ?? 0) >= 0 ? 'success' : 'danger'"
          class="dev-meta-strip__tag"
        >
          {{ rateText(props.overview?.today_income_change_rate) }}
        </TTag>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">完成订单</span>
        <span class="dev-meta-strip__value">{{ props.overview?.total_completed_orders ?? 0 }}</span>
      </div>
      <div class="dev-meta-strip__divider" />
      <div class="dev-meta-strip__item">
        <span class="dev-meta-strip__label">活跃需求</span>
        <span class="dev-meta-strip__value">{{
          props.overview?.active_requirement_count ?? 0
        }}</span>
      </div>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <TButton
          icon-only
          :loading="props.loading || props.depositLoading"
          aria-label="刷新钱包数据"
          @click="emit('refresh')"
        >
          <TIcon>
            <Refresh />
          </TIcon>
        </TButton>
      </div>
    </TLoading>
  </WorkbenchBarSlot>
</template>
