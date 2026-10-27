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
 * 接单保证金是**另一个资金池**（预付账户，1.x 的 `developer-order-deposit*`）：
 * 开发者先充值，接担保单时按预算冻结，违约时从里面划扣。它与上面这份「接单收入池」
 * 是两笔钱，所以分两张卡展示——合成一个余额会让人以为可以提现保证金赚来的钱。
 */
import { onMounted, ref } from 'vue'

import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWalletDepositCard from '@/components/dev/DevWalletDepositCard.vue'
import DevWalletDepositWithdrawDialog from '@/components/dev/DevWalletDepositWithdrawDialog.vue'
import DevWalletIncomeCard from '@/components/dev/DevWalletIncomeCard.vue'
import DevWalletStatsBar from '@/components/dev/DevWalletStatsBar.vue'
import { useDevWalletDeposit } from '@/composables/useDevWalletDeposit'
import { useDevWalletOverview } from '@/composables/useDevWalletOverview'
import { useAuthStore } from '@/stores/auth'
import { syncInflightRefunds } from '@/api/devWallet'
import { TIcon, TInput, Search } from 'ui_73info'

import DevFundRecordsView from './DevFundRecordsView.vue'

const auth = useAuthStore()

/** 接单保证金（预付账户）：余额读数与提现。与收入池是两笔钱，各取各的。 */
const {
  credit,
  deposit,
  loading: depositLoading,
  error: depositError,
  load: loadDeposit,
} = useDevWalletDeposit()

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

/** 明细子组件：刷新钱包时把提现台账也一起重取。 */
const fundRecords = ref<InstanceType<typeof DevFundRecordsView> | null>(null)

/** 充值：走保证金充值弹窗（与工作台总览共用同一个组件）。 */
const rechargeDepositDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)
const withdrawDepositDialog = ref<InstanceType<typeof DevWalletDepositWithdrawDialog> | null>(null)

function goRechargeDeposit() {
  void rechargeDepositDialog.value?.open()
}

onMounted(async () => {
  auth.hydrate()
  await refreshWallet()
})

/** 进页面与手动刷新都先同步一次在途退款，再读余额与明细。 */
async function refreshWallet() {
  // 渠道回调可能丢件：先让后端主动回查在途退款，再读余额与明细。
  // 同步失败不阻塞页面（渠道不可用时仍展示本地账）。
  await syncInflightRefunds(auth.token).catch(() => undefined)
  await Promise.all([loadWallet(), loadDeposit(), fundRecords.value?.loadRecords()])
}
</script>

<template>
  <div class="dev-page dev-wallet-page">
    <!-- 读数条：累计收入 / 今日入账 / 完成订单 / 活跃需求 + 刷新 -->
    <DevWalletStatsBar :overview="overview" :loading="loading" @refresh="refreshWallet" />

    <!-- 两个资金池并排：接单收入（可提现收益）与保证金余额（接单押金）。
         它们互不相通——合成一个余额会让人以为可以提现保证金赚来的钱，所以分两张卡。 -->
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

      <!-- 接单保证金：与上面的接单收入是两个资金池，单独一张卡 -->
      <DevWalletDepositCard
        :deposit="deposit"
        :credit="credit"
        :loading="depositLoading"
        :error="depositError"
        @recharge="goRechargeDeposit"
        @withdraw="withdrawDepositDialog?.open()"
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
      <DevFundRecordsView ref="fundRecords" :income="recentIncome" :keyword="recordKeyword" />
    </section>

    <!-- 收入提现弹窗：与工作台总览的「提现」按钮共用同一组件 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="refreshWallet" />

    <!-- 保证金充值 / 提现：与工作台总览共用充值弹窗 -->
    <DevDepositRechargeDialog ref="rechargeDepositDialog" @succeeded="loadDeposit" />
    <DevWalletDepositWithdrawDialog
      ref="withdrawDepositDialog"
      :withdrawable-fen="deposit?.withdrawableFen ?? 0"
      @succeeded="loadDeposit"
    />
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
