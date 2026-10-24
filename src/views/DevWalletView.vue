<script setup lang="ts">
/**
 * 开发者收益钱包：接单收入池的读数与出款入口，以及两类台账合成的资金明细。
 *
 * 这一页只做编排，取数与判定都在 composable 里：
 * | 关注点 | 落点 |
 * | --- | --- |
 * | 接单收入池（余额、提现偏好、自动提现开关、通道状态） | `useDevWalletOverview` |
 * | 资金明细（收入 / 退款冲减 / 收入提现） | `useDevFundRecords` + `shared/devFundDisplay` |
 * | 金额与文案口径 | `shared/devFundDisplay`（`money`）与 `shared/devWalletDisplay` |
 *
 * 契约里没有「预付保证金钱包」这套端点（1.x 的 `developer-order-deposit*`）。
 * 2.0 的接单保证金由后端在接单时从这份可提现收益里冻结，所以这一页只报收入池，不再有充值口径。
 */
import { onMounted, ref } from 'vue'

import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevWalletIncomeCard from '@/components/dev/DevWalletIncomeCard.vue'
import DevWalletStatsBar from '@/components/dev/DevWalletStatsBar.vue'
import { useDevWalletOverview } from '@/composables/useDevWalletOverview'
import { useAuthStore } from '@/stores/auth'
import { TIcon, TInput, Search } from 'ui_73info'

import DevFundRecordsView from './DevFundRecordsView.vue'

const auth = useAuthStore()

const {
  loading,
  overview,
  autoWithdrawSaving,
  recentIncome,
  canWithdraw,
  withdrawalSettingLoaded,
  payoutChannelReady,
  payoutChannelMessage,
  autoWithdrawEnabled,
  autoWithdrawReady,
  payoutScheduleNote,
  canSubmitWithdrawal,
  loadWallet,
  toggleAutoWithdraw,
  goBindSettlementAccount,
} = useDevWalletOverview()

/** 收入提现弹窗：余额与通道状态由子组件自己拉，这里只留调用句柄 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)

/** 「资金明细」的关键字筛选：只过滤已经加载回来的记录，不发新请求 */
const recordKeyword = ref('')

onMounted(async () => {
  auth.hydrate()
  await loadWallet()
})
</script>

<template>
  <div class="dev-page dev-wallet-page">
    <!-- 读数条：累计收入 / 今日入账 / 完成订单 / 活跃需求 + 刷新 -->
    <DevWalletStatsBar :overview="overview" :loading="loading" @refresh="loadWallet" />

    <!-- 接单收入卡：可提现大数、待提现/已提现、自动提现开关与两个出口 -->
    <div class="wallet-hero">
      <DevWalletIncomeCard
        :overview="overview"
        :can-withdraw="canWithdraw"
        :payout-schedule-note="payoutScheduleNote"
        :auto-withdraw-enabled="autoWithdrawEnabled"
        :auto-withdraw-saving="autoWithdrawSaving"
        :auto-withdraw-ready="autoWithdrawReady"
        :can-submit-withdrawal="canSubmitWithdrawal"
        :withdrawal-setting-loaded="withdrawalSettingLoaded"
        :payout-channel-ready="payoutChannelReady"
        :payout-channel-message="payoutChannelMessage"
        @toggle-auto-withdraw="toggleAutoWithdraw"
        @withdraw="withdrawDialog?.open()"
        @bind-account="goBindSettlementAccount"
      />
    </div>

    <section class="dev-surface-card wallet-records" aria-label="资金明细">
      <div class="dev-card-head">
        <div class="dev-card-head__title-block">
          <h3 class="dev-section-title">资金明细</h3>
        </div>
      </div>
      <div class="dev-toolbar">
        <TInput
          v-model="recordKeyword"
          class="dev-toolbar__search"
          clearable
          placeholder="搜索单号、类型、状态或处理备注"
        >
          <template #prefix>
            <TIcon>
              <Search />
            </TIcon>
          </template>
        </TInput>
      </div>

      <!-- 资金明细：收入 / 退款冲减 / 收入提现三类合成一段（子组件里按时间倒序拼） -->
      <DevFundRecordsView :income="recentIncome" :keyword="recordKeyword" />
    </section>

    <!-- 收入提现弹窗：与工作台总览的「提现」按钮共用同一组件 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="loadWallet" />
  </div>
</template>

<style scoped>
/* 表格走 dev-base.css 的 .dev-table，表尾走 .dev-pager（这两处原来在页内用 :deep 改写，
   还顺手改了子组件 DevFundRecordsView 里的同名元素）。这里只留本页特有样式。 */
/* 钱包记录与其余菜单页的列表同构：一张 .dev-surface-card（同底/同描边/同圆角/同阴影，
   内边距 24px 由统一层给）。原来它是页面上的一条裸区块——标题与表格直接压在页面背景上，
   只靠一条顶部分隔线开头，与资源列表、我的接单那种「标题 + 工具栏 + 列表都在卡片里」
   不是一种结构，切菜单时整页的骨架会变。 */
.wallet-records {
  min-width: 0;
}

/* 记录切换与关键字搜索一起走统一层的 .dev-toolbar（筛选 → 搜索 → 右侧动作），
   间距由工具栏自己给，本页不再补 margin。 */
</style>
