<script setup lang="ts">
/**
 * 开发者收益钱包：接单收入与保证金两个池子的读数、出款入口，以及四类台账合成的资金明细。
 *
 * 这一页只做编排，取数与判定都在 composable 里：
 * | 关注点 | 落点 |
 * | --- | --- |
 * | 接单收入池（余额、提现偏好、自动提现开关、通道状态） | `useDevWalletOverview` |
 * | 保证金池（三档读数、台账、后台轮询） | `useDevWalletDeposit` |
 * | 保证金提现表单与提交 | `useDevDepositWithdrawForm`（弹窗组件内用） |
 * | 金额与文案口径 | `shared/devFundDisplay`（`money`）与 `shared/devWalletDisplay` |
 *
 * 两个池子分属互不相通的账：收入提现走 `DevWithdrawalDialog`，保证金退回走
 * `DevWalletDepositWithdrawDialog`，各自提交成功后只回刷自己那一半。
 */
import { onMounted, ref } from 'vue'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevWalletDepositCard from '@/components/dev/DevWalletDepositCard.vue'
import DevWalletDepositWithdrawDialog from '@/components/dev/DevWalletDepositWithdrawDialog.vue'
import DevWalletIncomeCard from '@/components/dev/DevWalletIncomeCard.vue'
import DevWalletStatsBar from '@/components/dev/DevWalletStatsBar.vue'
import { useDevWalletDeposit } from '@/composables/useDevWalletDeposit'
import { useDevWalletOverview } from '@/composables/useDevWalletOverview'
import { useAuthStore } from '@/stores/auth'
import DevFundRecordsView from './DevFundRecordsView.vue'

import { TIcon, TInput, Search } from 'ui_73info'

const auth = useAuthStore()

/** 接单收入池 */
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

/** 保证金池 */
const {
  depositLoading,
  depositStatus,
  depositWithdrawalSummary,
  creditInfo,
  depositWithdrawable,
  depositTotalPaid,
  canWithdrawDeposit,
  loadDeposit,
} = useDevWalletDeposit()

/** 保证金充值弹窗：表单与下单都由子组件承载，这里只留一个调用句柄 */
const rechargeDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)
/** 收入提现弹窗：余额与通道状态由子组件自己拉，这里只留调用句柄 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)
/** 保证金提现弹窗：表单与提交在 `useDevDepositWithdrawForm`，这里同样只留句柄 */
const depositWithdrawDialog = ref<InstanceType<typeof DevWalletDepositWithdrawDialog> | null>(null)

/** 「资金明细」的关键字筛选：只过滤已经加载回来的记录，不发新请求（四类记录共用一个关键字） */
const recordKeyword = ref('')

/** 两个池子一起重拉：读数条的刷新按钮与首屏共用同一条路径 */
function reloadWallet() {
  return Promise.all([loadWallet(), loadDeposit()])
}

onMounted(async () => {
  auth.hydrate()
  await reloadWallet()
})
</script>

<template>
  <div class="dev-page dev-wallet-page">
    <!-- 次要统计条 -->
    <DevWalletStatsBar
      :overview="overview"
      :loading="loading"
      :deposit-loading="depositLoading"
      @refresh="reloadWallet"
    />

    <!-- 主余额卡片：两个池子各一张，读数与出口都在卡里 -->
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
      <DevWalletDepositCard
        :withdrawable="depositWithdrawable"
        :total-paid="depositTotalPaid"
        :status="depositStatus"
        :summary="depositWithdrawalSummary"
        :credit="creditInfo"
        :can-withdraw="canWithdrawDeposit"
        :loading="depositLoading"
        @withdraw="depositWithdrawDialog?.open()"
        @recharge="rechargeDialog?.open()"
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

      <!-- 资金明细：保证金充值 / 保证金提现 / 收入 / 收入提现四类合成一段（子组件里按时间倒序拼） -->
      <DevFundRecordsView :income="recentIncome" :keyword="recordKeyword" />
    </section>

    <!-- 收入提现弹窗：与工作台总览的「提现」按钮共用同一组件 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="loadWallet" />

    <!-- 保证金提现弹窗 -->
    <DevWalletDepositWithdrawDialog
      ref="depositWithdrawDialog"
      :withdrawable="depositWithdrawable"
      @submitted="loadDeposit({ silent: true, background: true })"
    />

    <!-- 保证金充值弹窗：与工作台总览的「保证金不足」提示共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />
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
