<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { TIcon, TMessage, WarningFilled } from 'ui_73info'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevDeliveryList from '@/components/dev/DevDeliveryList.vue'
import DevFunnel from '@/components/dev/DevFunnel.vue'
import DevFundPanel from '@/components/dev/DevFundPanel.vue'
import DevHomeMetaStrip from '@/components/dev/DevHomeMetaStrip.vue'
import DevLiveBoard from '@/components/dev/DevLiveBoard.vue'
import DevProjectList from '@/components/dev/DevProjectList.vue'
import { useDevHomeBoard } from '@/composables/useDevHomeBoard'
import { useDevHomeDashboard } from '@/composables/useDevHomeDashboard'
import { useDevHomeIncomeChart } from '@/composables/useDevHomeIncomeChart'
import { useDevHomeLists } from '@/composables/useDevHomeLists'
import { useFullscreen } from '@/composables/useFullscreen'
import { money } from '@/shared/devFundDisplay'

/**
 * 卸载标记：**只在视图这一份**，往下传的是只读 getter（`isMounted: () => isMounted`），
 * composable 不许自持一份 —— 否则视图卸载后谁清谁不清就成了两套说法。
 */
let isMounted = true

/** 数据层不引 `TMessage`：登录失效与四接口失败这两句文案留在视图，出错时交回去弹。 */
const DASHBOARD_TEXTS = {
  loginExpired: '登录状态已失效，请重新登录',
  loadFailed: '加载工作台总览失败',
}

/** 动态流第一次铺满时不播入场动画，之后新插入的条目才高亮一次。 */
const feedAnimated = ref(false)

/** 快照落库后的收尾：首帧只把标记翻上去，入场动画从下一条开始（时序与拆分前一样，仍在 nextTick 里）。 */
function onDashboardApplied() {
  if (feedAnimated.value) {
    return
  }
  void nextTick(() => {
    feedAnimated.value = true
  })
}

/**
 * 数据层整块在 `useDevHomeDashboard`：四份汇总的取数与 5 分钟轮询、全屏看板的快照（连 / 断
 * WebSocket、进全屏那一下的首帧拉取、`generated_at` 防旧帧覆盖）、快照回写钱包与保证金，
 * 以及读数条上那几个口径。视图只把卸载标记与错误出口传下去，自己不持有这些事实。
 */
const {
  loading,
  overview,
  deposit,
  requirements,
  resources,
  dashboard,
  mockEnabled,
  activeProjectCount,
  pendingDeliveryCount,
  completedProjectCount,
  withdrawable,
  pendingWithdraw,
  paidWithdraw,
  depositInsufficient,
  depositStatusChip,
  changeRate,
  connectionLamp,
  lastUpdatedText,
  loadPage,
  reloadWallet,
  enterLiveBoard,
  disconnectLiveBoard,
} = useDevHomeDashboard({
  isMounted: () => isMounted,
  texts: DASHBOARD_TEXTS,
  onError: (message) => TMessage.error(message),
  onDashboardApplied,
})

const router = useRouter()

/**
 * 全屏看板：只把总览区（本页根节点）放进全屏，侧栏与门户顶栏不跟进来。
 * 平板档读数条平时被搬进工作台顶栏，全屏时让它留在原地（见 WorkbenchBarSlot 的 disabled），
 * 这样读数与退出按钮都在全屏里。
 *
 * 监听、收发与看板时钟在 `useFullscreen`；**进入全屏就连实时看板、退出就断开**这两件事是
 * 本页的事，由它回调进来（两个动作的实现搬进了数据层，回调顺序与拆分前一字未动）。原先这三件事
 * 在同一个 `watch(isFullscreen)` 里，顺序是「时钟起 → 进看板」，拆开后仍是这个顺序。
 */
const homeRef = ref<HTMLElement | null>(null)

const { isFullscreen, fullscreenSupported, toggleFullscreen, now } = useFullscreen({
  target: homeRef,
  onEnter: () => {
    void enterLiveBoard()
  },
  onLeave: () => {
    disconnectLiveBoard()
  },
  onDenied: () => {
    TMessage.error('当前浏览器不允许进入全屏')
  },
})

/** 读数条、接单漏斗、动态流与看板时钟的口径在 `useDevHomeBoard`（全屏有快照时才改走快照）。 */
const { liveBoard, statCards, funnelCells, feedRows, resourceCells, clockTime, clockDate } =
  useDevHomeBoard({
    isFullscreen,
    dashboard,
    overview,
    activeProjectCount,
    completedProjectCount,
    pendingDeliveryCount,
    now,
  })

/** 近 7 天到账曲线与「需求单 → 已到账尾款」映射在 `useDevHomeIncomeChart`。 */
const { incomeBuckets, chartDays, chartCaption, incomeByRequirement } = useDevHomeIncomeChart({
  liveBoard,
  overview,
  mockEnabled,
})

/** 两张列表卡的行（哪几档算进行中、全屏时不受 5 条 / 3 张限制）在 `useDevHomeLists`。 */
const {
  PROJECT_TABS,
  DELIVERY_TABS,
  activeProjectTab,
  activeDeliveryTab,
  projectRows,
  deliveryRows,
} = useDevHomeLists({ isFullscreen, liveBoard, requirements, resources, incomeByRequirement })

/** 保证金不足时直接在总览页充值，不走跳转：与收益钱包页共用同一个充值弹窗 */
const rechargeDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)

/** 提现同样就地开窗：余额、通道状态与提交都在弹窗内完成，只有提交成功后才回刷本页读数 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)

/** 进页一次取数（本页没有后台轮询：原实现就只有这一处，别在这里加定时器）。 */
onMounted(() => {
  void loadPage()
})

/** 卸载标记在这里落下：数据层只读它，慢响应回来时不再往回写。 */
onBeforeUnmount(() => {
  isMounted = false
})

/**
 * 总览页的进行中项目与最近交付都只做汇总，完整明细（需求单、交付版本、到账回执）在「我的接单」页。
 * 点进去时带上需求编号：那页把它灌进搜索框，落地就停在这一单上，不用再自己找。
 */
function openMyOrder(requirementId: string) {
  if (!requirementId) {
    return
  }

  void router.push({ name: 'dev-my-requirements', query: { requirement_id: requirementId } })
}
</script>

<template>
  <div
    ref="homeRef"
    class="dev-page dev-home"
    :class="{ 'dev-home--loading': loading, 'dev-home--fullscreen': isFullscreen }"
  >
    <p v-if="mockEnabled" class="dev-home__mock-hint" role="note">
      演示数据：本页未读取后端接口，仅用于预览布局。去掉地址上的 <code>?mock=1</code>， 或清掉
      <code>VITE_DEV_HOME_MOCK</code> 后重启 dev server，即恢复真实数据。
    </p>

    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、刷新在右）。
         四格可点卡片已并入横条：读数对应的明细页在侧边栏和下方列表里都有入口，
         不必在这一层再挂四条跳转。读数与时钟的口径留在本页，条子本身在 DevHomeMetaStrip。 -->
    <DevHomeMetaStrip
      :loading="loading"
      :disabled="isFullscreen"
      :is-fullscreen="isFullscreen"
      :fullscreen-supported="fullscreenSupported"
      :clock-time="clockTime"
      :clock-date="clockDate"
      :lamp="connectionLamp"
      :updated-text="lastUpdatedText"
      :updated-title="dashboard?.generated_at ?? ''"
      :cards="statCards"
      @toggle="toggleFullscreen"
      @refresh="loadPage"
    />

    <!-- 保证金警示条：摆在四格读数之后——先看当天读数，再看为什么还不能接单。
         形状与配色走统一层的 .dev-notice（金色 + 图标徽标 + 文案 + 右侧动作），
         与需求大厅的资格提示同一种横幅。 -->
    <section v-if="depositInsufficient" class="dev-notice" role="alert">
      <span class="dev-notice__icon" aria-hidden="true">
        <TIcon>
          <WarningFilled />
        </TIcon>
      </span>
      <div class="dev-notice__copy">
        <strong>保证金不足，暂不可接单</strong>
        <p>当前可用保证金 {{ money(deposit?.available_cny) }}，补齐后才能绑定资源项目。</p>
      </div>
      <div class="dev-notice__action">
        <button class="dev-btn dev-btn--gold" type="button" @click="rechargeDialog?.open()">
          立即充值
        </button>
      </div>
    </section>

    <!-- 接单漏斗：只在全屏看板上出现。五个在途状态按流程从左到右，最后一格是本月完成
         （档位与色调在下方 funnelCells 里算，组件只画） -->
    <DevFunnel v-if="funnelCells.length" :cells="funnelCells" />

    <section class="dev-home__layout">
      <div class="dev-home__main">
        <!-- 两张列表卡：行仍由本页算（哪几档算进行中、全屏时不受 5 条 / 3 张的限制），
             组件只画；点行与「查看全部」都回本页跳「我的接单」 -->
        <DevProjectList
          v-model:active-tab="activeProjectTab"
          :rows="projectRows"
          :tabs="PROJECT_TABS"
          :more-to="{ name: 'dev-my-requirements' }"
          @open="openMyOrder"
        />

        <DevDeliveryList
          v-model:active-tab="activeDeliveryTab"
          :rows="deliveryRows"
          :tabs="DELIVERY_TABS"
          :more-to="{ name: 'dev-my-requirements' }"
          @open="openMyOrder"
        />
      </div>

      <aside class="dev-home__aside">
        <!-- 收入、提现、保证金合并成一张「资金概览」：同一笔钱全页只出现一次（口径在 DevFundPanel）。
             提现 / 充值仍由本页就地拉起弹窗，成功后才回刷钱包读数。 -->
        <DevFundPanel
          :today-income="overview?.today_income_cny ?? null"
          :change-rate="changeRate"
          :chart-days="chartDays"
          :chart-caption="chartCaption"
          :buckets="incomeBuckets"
          :month-income="liveBoard?.month_income_cny ?? null"
          :withdrawable="withdrawable"
          :pending-withdraw="pendingWithdraw"
          :paid-withdraw="paidWithdraw"
          :available-deposit="deposit?.available_cny ?? null"
          :frozen-deposit="deposit?.frozen_cny ?? null"
          :total-paid-deposit="deposit?.total_paid_cny ?? null"
          :deposit-chip="depositStatusChip"
          @withdraw="withdrawDialog?.open()"
          @recharge="rechargeDialog?.open()"
        />
      </aside>

      <!-- 看板第三栏：实时动态流 + 资源项目概况，只在全屏且拿到快照后出现。
           行（图标、色调、时间文案与键）在本页算，组件只画；首帧不播入场动画由 feedAnimated 把着 -->
      <DevLiveBoard
        v-if="liveBoard"
        :feed="feedRows"
        :animated="feedAnimated"
        :resources="resourceCells"
      />
    </section>

    <!-- 保证金充值弹窗：与收益钱包页共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />

    <!-- 收入提现弹窗：提交成功后只回刷钱包读数，其余三块与本页的提现无关 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="reloadWallet" />
  </div>
</template>

<style scoped src="./../components/dev/dev-home-page.css"></style>

<style scoped src="./../components/dev/dev-home-responsive.css"></style>
