<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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
import type { DevDashboardPipeline } from '@/api/devDashboard'
import { useDevHomeDashboard } from '@/composables/useDevHomeDashboard'
import { useFullscreen } from '@/composables/useFullscreen'
import { CHART_BUCKETS, type DevHomeIncomeBucket } from '@/composables/useIncomeChart'
import { DEMO_DEV_HOME_DAILY_INCOME } from '@/shared/devHomeMock'
import { money } from '@/shared/devFundDisplay'
import {
  STATUS_TONES,
  buildFeedRows,
  buildResourceCells,
  type DevHomeDeliveryRow,
  type DevHomeProjectRow,
  type DevHomeStatCard,
  type DevHomeTone,
} from '@/shared/devHomeDisplay'
import {
  isActiveRequirement,
  requirementProgressPercent,
  requirementStatusLabel,
} from '@/shared/requirementStatus'

/** 总览页只做汇总：列表最多展示 5 条，完整明细留在「我的接单」页。 */
const OVERVIEW_LIST_LIMIT = 5

/** 最近交付排成三列卡片，正好铺满一行；多出来的条数交给「查看全部」去「我的接单」看。 */
const DELIVERY_GRID_LIMIT = 3

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

type ProjectTabKey = 'all' | 'active' | 'pending' | 'completed'

const PROJECT_TABS: ReadonlyArray<{ key: ProjectTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'pending', label: '待交付' },
  { key: 'completed', label: '已完成' },
]

type DeliveryTabKey = 'all' | 'delivered' | 'pending'

const DELIVERY_TABS: ReadonlyArray<{ key: DeliveryTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'delivered', label: '已交付' },
  { key: 'pending', label: '未交付' },
]

const activeProjectTab = ref<ProjectTabKey>('all')
const activeDeliveryTab = ref<DeliveryTabKey>('all')

/** 保证金不足时直接在总览页充值，不走跳转：与收益钱包页共用同一个充值弹窗 */
const rechargeDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)

/** 提现同样就地开窗：余额、通道状态与提交都在弹窗内完成，只有提交成功后才回刷本页读数 */
const withdrawDialog = ref<InstanceType<typeof DevWithdrawalDialog> | null>(null)

/** 近 7 天曲线的原料：到账回执（全屏看板改画快照自带的 30 天序列，见下方 incomeBuckets）。 */
const recentIncome = computed(() => overview.value?.recent_income ?? [])

const resourceTitleMap = computed(
  () => new Map(resources.value.map((item) => [item.id, item.title])),
)

/** 需求单 → 已到账尾款金额：交付行右侧用它显示这一单回款了多少。 */
const incomeByRequirement = computed(() => {
  const map = new Map<string, number>()
  for (const item of recentIncome.value) {
    map.set(item.requirement_id, (map.get(item.requirement_id) ?? 0) + item.amount_cny)
  }

  return map
})

/** 在途五档：漏斗与读数条「进行中项目」共用，顺序即流程顺序。 */
const PIPELINE_STAGES: ReadonlyArray<Exclude<keyof DevDashboardPipeline, 'completed_this_month'>> =
  ['pending_deposit', 'deposit_paid', 'in_development', 'pending_final', 'pending_settlement']

/** 全屏且已拿到快照：看板上的读数改走快照，跟着推送实时变化；非全屏仍是进页那一次拉取。 */
const liveBoard = computed(() => (isFullscreen.value ? dashboard.value : null))

/** 四格统计卡读数：三格按接单状态分档，收入固定取后端给的累计到账金额。 */
const statCards = computed<DevHomeStatCard[]>(() => {
  const board = liveBoard.value
  const active = board
    ? PIPELINE_STAGES.reduce((sum, stage) => sum + board.pipeline[stage], 0)
    : activeProjectCount.value
  const completed = board ? board.wallet.total_completed_orders : completedProjectCount.value
  const pendingDelivery = board ? board.pipeline.pending_final : pendingDeliveryCount.value

  return [
    {
      label: '进行中项目',
      value: String(active),
    },
    {
      label: '已完成项目',
      value: String(completed),
    },
    {
      label: '待交付',
      value: String(pendingDelivery),
    },
    {
      label: '累计收入',
      value: money(overview.value?.total_income_cny),
    },
  ]
})

/** 终止态不进总览列表：那是已经结束的接单，留在「我的接单」里查。 */
function isOpenStatus(status: string): boolean {
  return status !== 'cancelled' && status !== 'rejected'
}

function matchesProjectTab(status: string): boolean {
  if (activeProjectTab.value === 'active') {
    return isActiveRequirement(status)
  }
  if (activeProjectTab.value === 'pending') {
    return status === 'pending_final'
  }
  if (activeProjectTab.value === 'completed') {
    return status === 'completed'
  }

  return true
}

function matchesDeliveryTab(versionCount: number): boolean {
  if (activeDeliveryTab.value === 'delivered') {
    return versionCount > 0
  }
  if (activeDeliveryTab.value === 'pending') {
    return versionCount === 0
  }

  return true
}

/** 全屏时不受 5 条 / 3 张的限制：看板上放得下多少就列多少，列表在区域内滚动。 */
const projectRows = computed<DevHomeProjectRow[]>(() => {
  const board = liveBoard.value
  if (board) {
    // 快照已按「在途在前、同组按更新时间倒序」排好，保持后端顺序
    return board.projects
      .filter((item) => isOpenStatus(item.status) && matchesProjectTab(item.status))
      .map((item) => ({
        requirementId: item.requirement_id,
        title: item.title,
        status: item.status,
        statusLabel: requirementStatusLabel(item.status, item.payment_mode),
        tone: STATUS_TONES[item.status] ?? 'blue',
        createdAt: item.updated_at,
        updatedAt: item.updated_at,
        budget: item.budget ?? null,
        progress: requirementProgressPercent(item.status),
      }))
  }

  const sorted = requirements.value
    .filter((item) => isOpenStatus(item.status) && matchesProjectTab(item.status))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))

  return (isFullscreen.value ? sorted : sorted.slice(0, OVERVIEW_LIST_LIMIT)).map((item) => ({
    requirementId: item.requirement_id,
    title: item.title,
    status: item.status,
    statusLabel: requirementStatusLabel(item.status, item.payment_mode),
    tone: STATUS_TONES[item.status] ?? 'blue',
    createdAt: item.created_time,
    updatedAt: item.updated_at,
    budget: item.budget ?? null,
    progress: requirementProgressPercent(item.status),
  }))
})

/** 交付 = 绑定资源项目的资源版本，所以最近交付按「已绑定资源的需求单」汇总。 */
const deliveryRows = computed<DevHomeDeliveryRow[]>(() => {
  const board = liveBoard.value
  if (board) {
    return board.deliveries
      .filter((item) => matchesDeliveryTab(item.version_count))
      .map((item) => ({
        requirementId: item.requirement_id,
        requirementTitle: item.requirement_title,
        resourceTitle: item.resource_title || `资源 #${item.resource_id}`,
        versionCount: item.version_count,
        delivered: item.version_count > 0,
        updatedAt: item.last_delivered_at ?? '',
        amount: item.amount_cny,
      }))
  }

  const sorted = requirements.value
    .filter((item) => item.bound_resource_id != null)
    .filter((item) => matchesDeliveryTab(item.bound_resource_version_count ?? 0))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))

  return (isFullscreen.value ? sorted : sorted.slice(0, DELIVERY_GRID_LIMIT)).flatMap((item) => {
    const resourceId = item.bound_resource_id
    if (resourceId == null) {
      return []
    }

    const versionCount = item.bound_resource_version_count ?? 0

    return [
      {
        requirementId: item.requirement_id,
        requirementTitle: item.title,
        resourceTitle: resourceTitleMap.value.get(resourceId) ?? `资源 #${resourceId}`,
        versionCount,
        delivered: versionCount > 0,
        updatedAt: item.updated_at,
        amount: incomeByRequirement.value.get(item.requirement_id) ?? null,
      },
    ]
  })
})

/** 两位补零：日期键、时钟与横轴标签共用。 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 曲线口径：近 7 天（含今天）的到账金额，最早一天在左（窗口长度取 `useIncomeChart` 的 CHART_BUCKETS）。
 * 后端没有时间序列接口：演示模式用自带序列，真实模式把最近到账记录按到账日归集。
 * 真实模式下接口最多只返回 100 笔，所以这条曲线是「最近到账的分布」，不是完整流水。
 */
const incomeBuckets = computed<DevHomeIncomeBucket[]>(() => {
  // 全屏看板改画近 30 天：快照自带完整日序列（从旧到新、无收入补 0），不再从到账明细里归集
  const board = liveBoard.value
  if (board && board.income_daily.length) {
    return board.income_daily.map((item) => ({
      label: `${item.date.slice(5, 7)}/${item.date.slice(8, 10)}`,
      value: item.amount_cny,
    }))
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const byDay = new Map<string, number>()
  if (mockEnabled) {
    DEMO_DEV_HOME_DAILY_INCOME.forEach((amount, index) => {
      const date = new Date(today)
      date.setDate(date.getDate() - (DEMO_DEV_HOME_DAILY_INCOME.length - 1 - index))
      byDay.set(dayKey(date), amount)
    })
  } else {
    for (const item of recentIncome.value) {
      const paidAt = new Date(item.paid_at)
      if (Number.isNaN(paidAt.getTime())) {
        continue
      }
      byDay.set(dayKey(paidAt), (byDay.get(dayKey(paidAt)) ?? 0) + item.amount_cny)
    }
  }

  const buckets: DevHomeIncomeBucket[] = []
  for (let offset = CHART_BUCKETS - 1; offset >= 0; offset -= 1) {
    const date = new Date(today)
    date.setDate(date.getDate() - offset)
    buckets.push({
      label: `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`,
      value: byDay.get(dayKey(date)) ?? 0,
    })
  }

  return buckets
})

/**
 * 横轴标题里的天数：真机画近 7 天、全屏看板画快照自带的近 30 天，由数据条数决定。
 * 画布尺寸、坐标换算、峰值与悬停状态都在 `useIncomeChart` / `DevIncomeTrendChart`，这里只决定取哪几天的数。
 */
const chartDays = computed(() => incomeBuckets.value.length)

const chartCaption = computed(() => {
  if (liveBoard.value) {
    return `近 ${chartDays.value} 天每日到账（毛额）`
  }

  return mockEnabled ? '演示数据：近 7 天完整序列' : '按最近到账记录绘制（最多取最近 100 笔）'
})

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

/** 看板时钟的 `now` 由 `useFullscreen` 每秒推进；时间文案留在这里，与上方读数条同一种写法。 */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const clockTime = computed(() => {
  const date = new Date(now.value)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
})

const clockDate = computed(() => {
  const date = new Date(now.value)
  return `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAYS[date.getDay()]}`
})

/** 接单漏斗：五个在途状态 + 本月完成。`deposit_paid` 拿不到单条的支付模式，按统一口径两义并写。 */
const funnelCells = computed(() => {
  const board = liveBoard.value
  if (!board) {
    return []
  }

  const stages = PIPELINE_STAGES.map((stage) => ({
    key: stage,
    label: requirementStatusLabel(stage),
    value: board.pipeline[stage],
    tone: STATUS_TONES[stage] ?? 'blue',
  }))
  const peak = Math.max(1, ...stages.map((stage) => stage.value))

  return [
    ...stages.map((stage) => ({ ...stage, share: stage.value / peak, done: false })),
    {
      key: 'completed_this_month',
      label: '本月完成',
      value: board.pipeline.completed_this_month,
      tone: 'cyan' as DevHomeTone,
      share: 1,
      done: true,
    },
  ]
})

/**
 * 动态流与资源概况的行：图标 / 色调 / 时间文案 / 键怎么拼在 `buildFeedRows`，
 * 这里只把数据交给它，并给出「哪一天算今天」——那由看板时钟决定，跨零点时整列时间要跟着翻。
 */
const feedRows = computed(() =>
  liveBoard.value ? buildFeedRows(liveBoard.value.feed, dayKey(new Date(now.value))) : [],
)

const resourceCells = computed(() =>
  liveBoard.value ? buildResourceCells(liveBoard.value.resources) : [],
)
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

<style scoped>
/* 本页只用开发者体系令牌（--dev-*）：顶部读数条 → 左列表右资金卡。
   口径与颜色沿用收益钱包那一套，见 doc/设计规范.md 第一节。
   注意：列表与资金卡的静态排布已经跟着 `DevProjectList` / `DevDeliveryList` / `DevFundPanel`
   搬进各自的 scoped 样式；**跨到子组件内部的覆盖只能写在这里**，并带上 `:deep()`——
   父层的 scoped 属性只落在子组件根节点上，打不进它的后代。 */
/* 加载中压暗数据区，避免把「还没拿到数据」误读成真实的 0。
   卡片分两种：`DevProjectList` / `DevDeliveryList` / `DevFundPanel` 的根节点（父层 scoped 属性
   落得上去），以及 `DevLiveBoard` 内部的动态与资源卡（只有 `:deep()` 打得到）。一条 `:deep()`
   同时覆盖两种，选中的元素与拆分前完全一致。 */
.dev-home--loading :deep(.dev-home__panel) {
  opacity: 0.6;
}

.dev-home :deep(.dev-home__panel) {
  transition: opacity 0.2s ease;
}

/* 全屏看板：铺满屏幕、内容区可滚，两栏撑满剩余高度。
   提现 / 充值弹窗挂在 body 上、全屏里看不见，所以全屏时把这两个操作收起，只留读数。 */
.dev-home.dev-home--fullscreen {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 20px 24px;
  overflow-y: auto;
  background: var(--dev-bg);
}

/* 看板三栏：列表 | 资金 | 动态与资源。整块吃掉读数条与漏斗之下的剩余高度，
   每张卡在自己的区域里滚动，整页不出现横向滚动（1280×800 平板横屏一屏看全）。 */
.dev-home--fullscreen .dev-home__layout {
  flex: 1 1 auto;
  min-height: 0;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 0.95fr);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: 'main aside live';
}

.dev-home--fullscreen .dev-home__main {
  grid-area: main;
  grid-template-rows: minmax(0, 1.25fr) minmax(0, 1fr);
  min-height: 0;
}

.dev-home--fullscreen .dev-home__aside {
  grid-area: aside;
  grid-template-rows: minmax(0, 1fr);
  min-height: 0;
}

.dev-home--fullscreen .dev-home__fund {
  min-height: 0;
  overflow-y: auto;
}

/* 列表卡：卡片头 + 工具栏固定，列表本体在卡内滚动。
   `.dev-home__panel` 是子组件的根节点，父层的 scoped 属性会落上去。
   动态卡的同一套（`display: flex` / `min-height: 0`）跟着 `DevLiveBoard` 搬走了。 */
.dev-home--fullscreen .dev-home__main .dev-home__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 项目行 hover 底色靠负外边距伸出去，滚动容器会把它算成横向溢出：
   容器自己先向两侧借 10px 内边距，行就落回容器内。
   两个列表的本体在子组件里，`:deep()` 才打得到。 */
.dev-home--fullscreen :deep(.dev-home__projects),
.dev-home--fullscreen :deep(.dev-home__deliveries),
.dev-home__live :deep(.dev-home__feed) {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 -10px;
  padding: 0 10px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dev-home--fullscreen :deep(.dev-home__deliveries) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  padding-bottom: 2px;
}

/* 读数条在看板里：读数改成「标签在上、数字在下」，数字放大一档，远处也看得清。
   条子本体在 `DevHomeMetaStrip` 里，这几条要 `:deep()` 才打得到；`:deep()` 不吃 scoped 属性，
   所以权重与拆分前一样是「两个类 + 一个属性」，仍然压得过 dev-base.css 里的单类规则。 */
.dev-home--fullscreen :deep(.dev-meta-strip) {
  gap: 14px 18px;
}

.dev-home--fullscreen :deep(.dev-meta-strip__item:not(.dev-meta-strip__action)) {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.dev-home--fullscreen :deep(.dev-meta-strip__value) {
  font-size: 20px;
  font-weight: 800;
}

/* 时钟与状态灯（`.dev-home__clock*` / `.dev-home__live-state` / `.dev-home__lamp*`）连同
   两个 keyframes 一起搬进了 DevHomeMetaStrip.vue：它们只在那条读数条里出现，媒体覆盖也在那边。 */

/* 漏斗的静态排布搬进了 DevFunnel.vue（scoped 样式跟着组件走）；这里只留 900 / 640 两档的窄屏覆盖，
   见文件末尾的媒体块——`:deep()` 只能在「持有子组件的那一层」编译成后代选择器。 */

/* 动态流与资源概况的静态排布（行网格、图标徽标、入场动画与 keyframes）已搬进 DevLiveBoard.vue；
   这里只留 `.dev-home__live :deep(.dev-home__feed)` 那条滚动覆盖（见上方合并规则与 640 档）——
   它作用在子组件内部，`:deep()` 只能在持有子组件的那一层写。 */

/* 状态灯呼吸 / 闪烁与动态流入场动画的「减弱动效」开关，各自跟着元素搬进了
   DevHomeMetaStrip.vue / DevLiveBoard.vue 的 scoped 样式（scoped 会给 keyframes 改名，
   两半分开就配不上）。 */

/* 提现 / 充值两个动作在资金卡里（子组件），全屏时收起：弹窗挂在 body 上，全屏里看不见。 */
.dev-home--fullscreen :deep(.dev-home__money-action),
.dev-home--fullscreen :deep(.dev-home__deposit-action),
.dev-home--fullscreen .dev-notice__action,
.dev-home--fullscreen .dev-home__mock-hint {
  display: none;
}

/* 演示数据提示条：它是本地预览用的说明，比保证金警示条更轻，用虚线中性框 */
.dev-home__mock-hint {
  margin: 0;
  padding: 10px 16px;
  border: 1px dashed var(--dev-line);
  border-radius: var(--dev-radius-inner);
  background: var(--dev-bg);
  color: var(--dev-muted);
  font-size: 13px;
  line-height: 1.6;
}

.dev-home__mock-hint code {
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

/* 保证金不足的提示条改用统一层的 .dev-notice（金色 + 图标徽标 + 文案 + 右侧动作），
   本页不再自带这一套。 */

/* 两栏：左栏是两条列表，右栏是资金卡；窄屏并成一栏。
   两栏等高、左栏最后一张卡吃掉剩余高度：总览是拿来「看」的，两栏底边不齐会在下方留出一块空洞 */
.dev-home__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
  gap: 16px;
  align-items: stretch;
}

.dev-home__main,
.dev-home__aside {
  display: grid;
  gap: 16px;
  align-content: start;
}

.dev-home__main {
  grid-template-rows: auto minmax(0, 1fr);
  align-content: stretch;
}

.dev-home__aside {
  align-content: stretch;
}

/* 卡片内边距由统一层给（桌面 24px、≤720px 20px、≤640px 16px），见 dev-base.css
   与 dev-responsive.css 的 .dev-surface-card:not(.el-card)，本页不再单独写。 */

/* 900：双栏并一栏；交付卡片三列降两列 */
/* R047 断点收敛：原档位 980px → 900px */
@media (max-width: 900px) {
  .dev-home__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 交付卡本体在 DevDeliveryList，`:deep()` 才打得到；多带一个 `.dev-home` 只为压过子组件里
     同名的基样式——两份规则各在一个文件里，权重相等时只能靠注入顺序分胜负。 */
  .dev-home :deep(.dev-home__deliveries) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dev-home__main {
    grid-template-rows: none;
  }
}

/* 平板档（641–900）：拿平板看实时数据时最先看到资金，所以资金卡提到列表之前，
   卡内「收入走势 | 余额与保证金」左右并排，一屏看全，不用往下翻 */
/* R047 断点收敛：原档位 641–980px → 641–900px（区间查询，与纯 max-width 的 900px 块不是重复块） */
@media (min-width: 641px) and (max-width: 900px) {
  .dev-home__aside {
    order: -1;
  }

  /* `.dev-home__fund` 是 DevFundPanel 的根节点，父层的 scoped 属性落得上去，不必 `:deep()` */
  .dev-home__fund {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    column-gap: 24px;
    align-items: start;
  }

  .dev-home__fund :deep(.dev-card-head) {
    grid-column: 1 / -1;
  }

  .dev-home__fund :deep(.dev-home__fund-balance) {
    padding-left: 24px;
    border-left: 1px solid var(--dev-line);
  }

  .dev-home__fund :deep(.dev-home__fund-balance .dev-home__money) {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 640px) {
  /* 触屏档：列表行撑满一列，可点目标不小于 44px */
  .dev-home :deep(.dev-home__deliveries),
  .dev-home :deep(.dev-home__facts) {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 筛选胶囊在触屏档的高度由统一层给（dev-responsive.css 的 36px，与门户侧 .wb-chip--button 同档），
     总览页原来在这里自己写 32px，于是同一组筛选胶囊在总览页 32px、在需求大厅 36px。 */

  .dev-home :deep(.dev-home__more) {
    min-height: 44px;
  }

  /* 项目行在触屏档：编号行独占整宽并允许折行，进度整块落到下一行，条与读数仍同行 */
  .dev-home :deep(.dev-home__project-foot) {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .dev-home :deep(.dev-home__progress) {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  /* 触屏档不再单独压字号：统一层的 30px 在窄屏卡片里放得下（实测读数区最宽 342px 不溢出），
     单压总览页会让同一笔钱在总览与收益钱包两页大小不一，切菜单时数字会跳。 */

  /* 内嵌块跟着卡片一起收窄，否则卡片 16px 内边距下这块只剩一层薄框 */
  .dev-home :deep(.dev-home__deposit) {
    padding: 12px;
  }

  /* 触屏档按钮撑满整行并抬到 44px：36px 的可点面积不达标，见设计规范第六节 */
  .dev-home :deep(.dev-home__money-action),
  .dev-home :deep(.dev-home__deposit-action),
  .dev-notice__action .dev-btn {
    flex: 1 1 100%;
    min-width: 0;
    min-height: 44px;
    height: 44px;
  }
}

/* 看板竖屏档（平板竖屏 820×1180）：资金卡占满一行（卡内仍是「走势 | 余额」左右并排），
   下面两栏：列表 | 动态与资源 */
/* R047 断点收敛：原档位 980px → 900px（本文件另一处 900px 块在 640px 块之前，中间隔着规则，未合并） */
@media (max-width: 900px) {
  .dev-home.dev-home--fullscreen {
    padding: 16px 20px;
  }

  .dev-home--fullscreen .dev-home__layout {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'aside aside'
      'main live';
  }

  .dev-home--fullscreen .dev-home__main {
    grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
  }

  .dev-home--fullscreen .dev-home__fund {
    overflow: visible;
  }

  .dev-home--fullscreen :deep(.dev-home__deliveries) {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 统一层在这一档把读数条改成两列网格（菜单页里读数少、一格一行）；看板上读数多，
     两列会把它撑到四五行高。看板里改回横排：首行标题 + 时钟 + 状态，次行四格读数 + 按钮。
     条子本体在 DevHomeMetaStrip.vue 里，这几条一律 `:deep()`；`:deep()` 不吃 scoped 属性，
     权重仍是「两个类 + 一个属性」，与拆分前一致，压得过 dev-responsive.css 里的单类规则。 */
  .dev-home--fullscreen :deep(.dev-meta-strip) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    padding: 12px 18px;
  }

  .dev-home--fullscreen :deep(.dev-meta-strip__divider) {
    display: block;
  }

  .dev-home--fullscreen :deep(.dev-home__live-divider) {
    flex: 0 0 100%;
    width: auto;
    height: 1px;
  }

  .dev-home--fullscreen :deep(.dev-meta-strip__item.dev-meta-strip__action) {
    margin-left: auto;
  }

  /* 漏斗的静态排布在 DevFunnel.vue，窄档覆盖只能留在这里：`:deep()` 只在「持有子组件的那一层」
     编译成后代选择器，写进子组件自己的 scoped 里反而匹配不到。
     多带一个 `.dev-home` 不为选中别的元素，只为压过子组件里同名的基样式——拆分后两份规则各在一个
     文件里，权重相等时就只能靠注入顺序分胜负，那是不该依赖的东西。 */
  .dev-home .dev-home__funnel {
    gap: 8px;
  }

  .dev-home .dev-home__funnel :deep(.dev-home__funnel-cell) {
    padding: 10px 10px 8px;
  }

  .dev-home .dev-home__funnel :deep(.dev-home__funnel-value) {
    font-size: 26px;
  }
}

/* 手机档的全屏不追求一屏看全：一栏排到底、整页纵向滚动，各卡不再限高 */
@media (max-width: 640px) {
  .dev-home--fullscreen .dev-home__layout {
    flex: 0 0 auto;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    grid-template-areas:
      'aside'
      'main'
      'live';
  }

  .dev-home--fullscreen .dev-home__main {
    grid-template-rows: none;
  }

  .dev-home--fullscreen :deep(.dev-home__projects),
  .dev-home--fullscreen :deep(.dev-home__deliveries),
  .dev-home__live :deep(.dev-home__feed) {
    overflow: visible;
  }

  .dev-home .dev-home__funnel {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* 箭头只被「显隐」覆盖（子组件那条规则里没有 display），所以不必提权重 */
  .dev-home__funnel :deep(.dev-home__funnel-cell::after) {
    display: none;
  }
}
</style>
