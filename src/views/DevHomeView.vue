<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, type Component } from 'vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import { useRoute, useRouter } from 'vue-router'
import {
  TButton,
  TIcon,
  TLoading,
  ArrowDown,
  ArrowRight,
  Box,
  CircleCheck,
  Clock,
  Lock,
  Money,
  Promotion,
  Refresh,
  Switch,
  TMessage,
  View,
  Wallet,
  WarningFilled,
} from 'ui_73info'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import DevFunnel from '@/components/dev/DevFunnel.vue'
import DevIncomeTrendChart from '@/components/dev/DevIncomeTrendChart.vue'
import {
  devDashboardWsUrl,
  getDevDashboard,
  type DevDashboardFeedKind,
  type DevDashboardPipeline,
  type DevDashboardSnapshot,
} from '@/api/devDashboard'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import {
  getDevWalletOverview,
  type DevWalletIncomeItem,
  type DevWalletOverview,
} from '@/api/devWallet'
import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { useDevDashboardSocket } from '@/composables/useDevDashboardSocket'
import { useFullscreen } from '@/composables/useFullscreen'
import { CHART_BUCKETS, type DevHomeIncomeBucket } from '@/composables/useIncomeChart'
import {
  DEMO_DEV_HOME_DAILY_INCOME,
  DEMO_DEV_HOME_DEPOSIT,
  DEMO_DEV_HOME_REQUIREMENTS,
  DEMO_DEV_HOME_RESOURCES,
  DEMO_DEV_HOME_WALLET,
  demoDevDashboard,
  devHomeMockEnabled,
} from '@/shared/devHomeMock'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import {
  isActiveRequirement,
  requirementProgressPercent,
  requirementStatusLabel,
} from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

/** 页面只用开发者体系的三个强调色，灰色留给终止态，不引入第五种颜色。 */
type DevHomeTone = 'blue' | 'gold' | 'cyan' | 'muted'

/** 总览页只做汇总：列表最多展示 5 条，完整明细留在「我的接单」页。 */
const OVERVIEW_LIST_LIMIT = 5

/** 最近交付排成三列卡片，正好铺满一行；多出来的条数交给「查看全部」去「我的接单」看。 */
const DELIVERY_GRID_LIMIT = 3

/** 顶部读数条的一格：口径数字，与其他菜单页的顶条同形（读左、刷新右）。 */
type DevHomeStatCard = {
  label: string
  value: string
}

/** 进行中项目列表的一行：状态、预算与流程进度都来自同一条接单。 */
type DevHomeProjectRow = {
  requirementId: string
  title: string
  status: string
  statusLabel: string
  tone: DevHomeTone
  createdAt: string
  updatedAt: string
  budget: number | null
  progress: number
}

/** 交付行：一条接了资源的需求单 = 一次交付，金额取该单的到账尾款。 */
type DevHomeDeliveryRow = {
  requirementId: string
  requirementTitle: string
  resourceTitle: string
  versionCount: number
  delivered: boolean
  updatedAt: string
  amount: number | null
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const loading = ref(false)
const overview = ref<DevWalletOverview | null>(null)
const deposit = ref<DevOrderDepositStatus | null>(null)
const requirements = ref<RequirementItem[]>([])
const resources = ref<McResourcePayload[]>([])

/** 全屏看板的快照：只在全屏时经 WebSocket（或进全屏那一下的一次拉取）填充，退出全屏后保留最后一份。 */
const dashboard = shallowRef<DevDashboardSnapshot | null>(null)

/** 演示数据开关：开着时整页不读接口，只用于本地预览布局。 */
const mockEnabled = devHomeMockEnabled(route.query.mock === '1')

/** 需求状态 → 色调：进行中蓝、等待付款金、已完成青，终止态灰。 */
const STATUS_TONES: Record<string, DevHomeTone> = {
  pending_review: 'muted',
  rejected: 'muted',
  cancelled: 'muted',
  pending_deposit: 'gold',
  pending_final: 'gold',
  pending_settlement: 'gold',
  deposit_paid: 'blue',
  in_development: 'blue',
  completed: 'cyan',
}

/** 状态标签沿用统一口径：浅底 + 深字，四档底色全部取统一层的 .dev-chip 系列。 */
const CHIP_TONES: Record<DevHomeTone, string> = {
  blue: '',
  gold: 'dev-chip--warm',
  cyan: 'dev-chip--cyan',
  muted: 'dev-chip--muted',
}

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

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])

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

/** 进行中项目：所有未结单的接单，是「待交付」的上位口径。 */
const activeProjectCount = computed(
  () => requirements.value.filter((item) => isActiveRequirement(item.status)).length,
)

/** 待交付：已交出成果、等需求方验收付尾款（状态 `pending_final`）。 */
const pendingDeliveryCount = computed(
  () => requirements.value.filter((item) => item.status === 'pending_final').length,
)

/** 已完成项目：只算已结单（状态 `completed`），待分账仍在进行中那一档里。 */
const completedProjectCount = computed(
  () => requirements.value.filter((item) => item.status === 'completed').length,
)

/** 在途五档：漏斗与读数条「进行中项目」共用，顺序即流程顺序。 */
const PIPELINE_STAGES: ReadonlyArray<Exclude<keyof DevDashboardPipeline, 'completed_this_month'>> = [
  'pending_deposit',
  'deposit_paid',
  'in_development',
  'pending_final',
  'pending_settlement',
]

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

    return [{
      requirementId: item.requirement_id,
      requirementTitle: item.title,
      resourceTitle: resourceTitleMap.value.get(resourceId) ?? `资源 #${resourceId}`,
      versionCount,
      delivered: versionCount > 0,
      updatedAt: item.updated_at,
      amount: incomeByRequirement.value.get(item.requirement_id) ?? null,
    }]
  })
})

/** 提现口径：可提现与待提现两笔金额，各报一次就够了（原先还有一条只换算成百分比的比例条，已删）。 */
const withdrawable = computed(() => overview.value?.withdrawable_balance_cny ?? 0)
const pendingWithdraw = computed(() => overview.value?.pending_withdraw_cny ?? 0)
const paidWithdraw = computed(() => overview.value?.paid_withdraw_cny ?? 0)

/** 未缴保证金或可用余额不足时后端会关掉绑定开关，两种情况共用同一条提示。 */
const depositInsufficient = computed(() => (deposit.value ? !deposit.value.can_bind_requirement : false))

/** 保证金状态胶囊：拿到接口数据后才出现，避免加载中把「还没读到」显示成「可接单」。 */
const depositStatusChip = computed(() => {
  if (!deposit.value) {
    return null
  }

  return depositInsufficient.value
    ? { label: '保证金不足', className: 'dev-chip--warm' }
    : { label: '可接单', className: 'dev-chip--cyan' }
})

const changeRate = computed(() => overview.value?.today_income_change_rate ?? null)

/** 涨幅正负都只影响颜色与符号，文案口径固定为「较昨日」。 */
const changeRateText = computed(() => {
  if (changeRate.value == null || !Number.isFinite(changeRate.value)) {
    return ''
  }

  const sign = changeRate.value > 0 ? '+' : ''
  return `${sign}${changeRate.value.toFixed(1)}%`
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

onMounted(() => {
  void loadPage()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
}

function statusChipClass(status: string) {
  return CHIP_TONES[STATUS_TONES[status] ?? 'blue']
}

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
 * 提现成功后的回刷：只重取钱包读数（可提现 / 待提现 / 已提现与近 7 天曲线），
 * 不整页重拉——进行中项目、最近交付与保证金都不受这次提现影响。
 */
async function reloadWallet() {
  if (!auth.token || mockEnabled) {
    return
  }

  try {
    overview.value = await getDevWalletOverview(auth.token)
  } catch {
    // 读数没刷上不影响「提现已提交」这个结论，下次刷新会补上
  }
}

async function loadPage() {
  auth.hydrate()
  if (!auth.token) {
    TMessage.error('登录状态已失效，请重新登录')
    return
  }

  // 演示数据只铺总览页的展示层，不参与任何写操作
  if (mockEnabled) {
    overview.value = DEMO_DEV_HOME_WALLET
    deposit.value = DEMO_DEV_HOME_DEPOSIT
    requirements.value = DEMO_DEV_HOME_REQUIREMENTS
    resources.value = DEMO_DEV_HOME_RESOURCES
    return
  }

  loading.value = true
  try {
    const [wallet, depositStatus, myRequirements, resourceList] = await Promise.all([
      getDevWalletOverview(auth.token),
      getDevOrderDepositStatus(auth.token),
      listMyRequirements(auth.token),
      listMcResources(auth.token),
    ])

    overview.value = wallet
    deposit.value = depositStatus
    requirements.value = myRequirements
    resources.value = resourceList
  } catch (error) {
    TMessage.error(error instanceof Error ? error.message : '加载工作台总览失败')
  } finally {
    loading.value = false
  }
}

/**
 * 全屏看板：只把总览区（本页根节点）放进全屏，侧栏与门户顶栏不跟进来。
 * 平板档读数条平时被搬进工作台顶栏，全屏时让它留在原地（见 WorkbenchBarSlot 的 disabled），
 * 这样读数与退出按钮都在全屏里。
 *
 * 监听、收发与看板时钟在 `useFullscreen`；**进入全屏就连实时看板、退出就断开**这两件事是
 * 本页的事，由它回调进来。原先这三件事在同一个 `watch(isFullscreen)` 里，顺序是「时钟起 → 进看板」，
 * 拆开后仍是这个顺序。
 */
const homeRef = ref<HTMLElement | null>(null)

const { isFullscreen, fullscreenSupported, toggleFullscreen, now } = useFullscreen({
  target: homeRef,
  onEnter: () => {
    void enterLiveBoard()
  },
  onLeave: () => {
    liveSocket.disconnect()
  },
  onDenied: () => {
    TMessage.error('当前浏览器不允许进入全屏')
  },
})

/**
 * 实时看板：只在全屏时连 WebSocket，退出全屏 / 离开本页即断开（组件卸载时组合式函数自己收尾）。
 * 演示模式不连，直接铺一份本地快照。
 */
const liveSocket = useDevDashboardSocket({
  url: () => (auth.token ? devDashboardWsUrl(auth.token) : null),
  onSnapshot: applyDashboard,
})

/** 动态流第一次铺满时不播入场动画，之后新插入的条目才高亮一次。 */
const feedAnimated = ref(false)

/**
 * 同一份快照也回写钱包与保证金读数：资金卡沿用原来的绑定，数字跟着推送变；
 * 退出全屏后总览页看到的也是最新一份，而不是进页时那次拉取的旧值。
 */
function applyDashboard(snapshot: DevDashboardSnapshot) {
  const current = dashboard.value
  // 进全屏那一下的 HTTP 拉取可能比 WebSocket 首帧晚到，旧快照不能盖掉新快照
  if (current && snapshot.generated_at < current.generated_at) {
    return
  }

  dashboard.value = snapshot
  overview.value = { ...snapshot.wallet, recent_income: overview.value?.recent_income ?? [] }
  deposit.value = {
    username: auth.username ?? '',
    role: 'dev',
    paid_withdraw_cny: 0,
    latest_order: null,
    ...deposit.value,
    ...snapshot.deposit,
  }

  if (!feedAnimated.value) {
    void nextTick(() => {
      feedAnimated.value = true
    })
  }
}

async function enterLiveBoard() {
  if (mockEnabled) {
    applyDashboard(demoDevDashboard())
    return
  }

  liveSocket.connect()
  if (!dashboard.value && auth.token) {
    try {
      applyDashboard(await getDevDashboard(auth.token))
    } catch {
      // 首帧由 WebSocket 推送兜底，拉取失败不打断看板
    }
  }
}

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

/** 最后更新取快照的生成时间（服务端东八区），只显示时分秒；心跳不算更新。 */
const lastUpdatedText = computed(() => dashboard.value?.generated_at.slice(11, 19) || '—')

/** 状态灯：已连接用青（本页体系里的「正常 / 完成」色），重连中用金，已断开用灰。 */
const connectionLamp = computed<{ tone: 'ok' | 'warn' | 'off'; label: string }>(() => {
  if (mockEnabled) {
    return { tone: 'off', label: '演示数据' }
  }

  switch (liveSocket.status.value) {
    case 'open':
      return { tone: 'ok', label: '已连接' }
    case 'connecting':
      return { tone: 'warn', label: '连接中' }
    case 'reconnecting':
      return { tone: 'warn', label: '重连中' }
    default:
      return { tone: 'off', label: '已断开' }
  }
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

/** 动态流按 kind 配图标与颜色：到账金、交付青、状态蓝，提现 / 保证金走中性灰。 */
const FEED_KINDS: Record<DevDashboardFeedKind, { icon: Component; tone: DevHomeTone }> = {
  income: { icon: Money, tone: 'gold' },
  delivery: { icon: Promotion, tone: 'cyan' },
  status: { icon: Switch, tone: 'blue' },
  withdrawal: { icon: Wallet, tone: 'muted' },
  deposit: { icon: Lock, tone: 'muted' },
}

/** 动态流时间：今天只写时分，更早的带上月日。 */
function feedTime(at: string): string {
  const time = at.slice(11, 16)
  return at.slice(0, 10) === dayKey(new Date(now.value)) ? time : `${at.slice(5, 10)} ${time}`
}

/** 条目没有 id：用内容拼键，同一秒的同类事件再加序号，保证新条目插入时旧条目不重绘。 */
const feedRows = computed(() => {
  const board = liveBoard.value
  if (!board) {
    return []
  }

  const seen = new Map<string, number>()
  return board.feed.map((item) => {
    const base = `${item.kind}|${item.at}|${item.title}|${item.requirement_id ?? ''}|${item.amount_cny ?? ''}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const kind = FEED_KINDS[item.kind] ?? FEED_KINDS.status
    return {
      key: `${base}#${count}`,
      title: item.title,
      requirementId: item.requirement_id,
      amount: item.amount_cny,
      time: feedTime(item.at),
      fullTime: item.at,
      icon: kind.icon,
      tone: kind.tone,
    }
  })
})

const resourceCells = computed(() => {
  const board = liveBoard.value
  if (!board) {
    return []
  }

  return [
    { key: 'count', label: '资源数', value: board.resources.resource_count, icon: Box },
    { key: 'downloads', label: '总下载', value: board.resources.total_downloads, icon: ArrowDown },
    { key: 'views', label: '总浏览', value: board.resources.total_views, icon: View },
  ]
})

/** 动态流里的冲回、扣减是负数：符号写在货币符号前面（-¥0.01），不写成 ¥-0.01。 */
function signedMoney(value: number): string {
  return value < 0 ? `-${money(-value)}` : money(value)
}

function formatCount(value: number): string {
  return value.toLocaleString('zh-CN')
}
</script>

<template>
  <div ref="homeRef" class="dev-page dev-home"
    :class="{ 'dev-home--loading': loading, 'dev-home--fullscreen': isFullscreen }">
    <p v-if="mockEnabled" class="dev-home__mock-hint" role="note">
      演示数据：本页未读取后端接口，仅用于预览布局。去掉地址上的 <code>?mock=1</code>，
      或清掉 <code>VITE_DEV_HOME_MOCK</code> 后重启 dev server，即恢复真实数据。
    </p>

    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、刷新在右）。
         四格可点卡片已并入横条：读数对应的明细页在侧边栏和下方列表里都有入口，
         不必在这一层再挂四条跳转。 -->
    <WorkbenchBarSlot :disabled="isFullscreen">
      <TLoading tag="div" class="dev-meta-strip" aria-label="接单与收入概览" :loading="loading">
        <template v-if="isFullscreen">
          <strong class="dev-home__screen-title">工作台总览</strong>
          <!-- 看板挂在平板上常亮：时钟每秒走，状态灯与最后更新时间说明这块屏上的数字是不是活的 -->
          <div class="dev-home__clock" aria-label="当前时间">
            <span class="dev-home__clock-time">{{ clockTime }}</span>
            <span class="dev-home__clock-date">{{ clockDate }}</span>
          </div>
          <div class="dev-home__live-state">
            <span class="dev-home__lamp" :class="`dev-home__lamp--${connectionLamp.tone}`" role="status"
              aria-live="polite">
              <i class="dev-home__lamp-dot" aria-hidden="true" />
              {{ connectionLamp.label }}
            </span>
            <span class="dev-home__updated" :title="dashboard?.generated_at ?? ''">更新于 {{ lastUpdatedText }}</span>
          </div>
          <div class="dev-meta-strip__divider dev-home__live-divider" />
        </template>
        <template v-for="(item, index) in statCards" :key="item.label">
          <div v-if="index > 0" class="dev-meta-strip__divider" />
          <div class="dev-meta-strip__item">
            <span class="dev-meta-strip__label">{{ item.label }}</span>
            <span class="dev-meta-strip__value">{{ item.value }}</span>
          </div>
        </template>
        <div class="dev-meta-strip__item dev-meta-strip__action">
          <TButton v-if="fullscreenSupported" icon-only :aria-label="isFullscreen ? '退出全屏' : '全屏查看'"
            :title="isFullscreen ? '退出全屏' : '全屏查看'" @click="toggleFullscreen">
            <TIcon>
              <svg v-if="isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </TIcon>
          </TButton>
          <TButton icon-only :loading="loading" aria-label="刷新概览" @click="loadPage">
            <TIcon>
              <Refresh />
            </TIcon>
          </TButton>
        </div>
      </TLoading>
    </WorkbenchBarSlot>

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
        <section class="dev-surface-card dev-home__panel">
          <div class="dev-card-head">
            <!-- 筛选胶囊跟在标题后面同一行：总览卡片要省纵向空间，单独一行工具栏只放四个胶囊太空 -->
            <div class="dev-card-head__title-block dev-home__head-main">
              <h3 class="dev-section-title">进行中项目</h3>
              <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="进行中项目筛选">
                <button v-for="tab in PROJECT_TABS" :key="tab.key" class="dev-chip dev-chip--button" type="button"
                  role="tab" :aria-selected="activeProjectTab === tab.key"
                  :class="{ 'is-active': activeProjectTab === tab.key }" @click="activeProjectTab = tab.key">
                  {{ tab.label }}
                </button>
              </div>
            </div>
            <div class="dev-card-head__actions">
              <RouterLink class="dev-home__more" :to="{ name: 'dev-my-requirements' }">
                <span>查看全部</span>
                <TIcon>
                  <ArrowRight />
                </TIcon>
              </RouterLink>
            </div>
          </div>

          <ul v-if="projectRows.length" class="dev-home__projects">
            <li v-for="row in projectRows" :key="row.requirementId" class="dev-home__project"
              :class="`dev-home__project--${row.tone}`" role="button" tabindex="0"
              :aria-label="`查看「${row.title}」的接单与交付`" @click="openMyOrder(row.requirementId)"
              @keydown.enter.prevent="openMyOrder(row.requirementId)"
              @keydown.space.prevent="openMyOrder(row.requirementId)">
              <div class="dev-home__project-top">
                <strong class="dev-home__project-title">{{ row.title }}</strong>
                <span class="dev-chip dev-home__chip" :class="statusChipClass(row.status)">
                  {{ row.statusLabel }}
                </span>
              </div>

              <div class="dev-home__project-foot">
                <p class="dev-home__project-meta">
                  {{ row.requirementId }} · 预算
                  <strong class="dev-home__project-amount">{{ money(row.budget) }}</strong>
                  · 更新于 {{ formatCnDateTime(row.updatedAt) }}
                </p>

                <!-- 进度条表达的是「流程走到哪一步」（按接单状态推算），不是工作量完成度 -->
                <div class="dev-home__progress" title="按接单状态推算的流程进度">
                  <span class="dev-home__progress-track" role="progressbar" :aria-valuenow="row.progress"
                    aria-valuemin="0" aria-valuemax="100" :aria-label="`${row.title} 流程进度`">
                    <span class="dev-home__progress-fill" :class="`dev-home__progress-fill--${row.tone}`"
                      :style="{ width: `${row.progress}%` }" />
                  </span>
                  <span class="dev-home__progress-text">{{ row.progress }}%</span>
                </div>
              </div>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>当前筛选下没有项目</strong>
          </p>
        </section>

        <section class="dev-surface-card dev-home__panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block dev-home__head-main">
              <h3 class="dev-section-title">最近交付</h3>
              <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="最近交付筛选">
                <button v-for="tab in DELIVERY_TABS" :key="tab.key" class="dev-chip dev-chip--button" type="button"
                  role="tab" :aria-selected="activeDeliveryTab === tab.key"
                  :class="{ 'is-active': activeDeliveryTab === tab.key }" @click="activeDeliveryTab = tab.key">
                  {{ tab.label }}
                </button>
              </div>
            </div>
            <div class="dev-card-head__actions">
              <RouterLink class="dev-home__more" :to="{ name: 'dev-my-requirements' }">
                <span>查看全部</span>
                <TIcon>
                  <ArrowRight />
                </TIcon>
              </RouterLink>
            </div>
          </div>

          <ul v-if="deliveryRows.length" class="dev-home__deliveries">
            <li v-for="row in deliveryRows" :key="row.requirementId" class="dev-home__delivery" role="button" tabindex="0"
              :aria-label="`查看「${row.resourceTitle}」的交付与到账`" @click="openMyOrder(row.requirementId)"
              @keydown.enter.prevent="openMyOrder(row.requirementId)"
              @keydown.space.prevent="openMyOrder(row.requirementId)">
              <div class="dev-home__delivery-top">
                <span class="dev-home__delivery-icon" aria-hidden="true">
                  <TIcon>
                    <Promotion />
                  </TIcon>
                </span>
                <strong class="dev-home__delivery-title">{{ row.resourceTitle }}</strong>
                <!-- 交付过的打勾：卡片只看一行，没有勾就得逐字读版本数才知道交付没交付 -->
                <TIcon v-if="row.delivered" class="dev-home__delivery-check">
                  <CircleCheck />
                </TIcon>
              </div>

              <p class="dev-home__delivery-meta">
                <span class="dev-home__delivery-id">{{ row.requirementId }}</span>
                <span class="dev-home__delivery-versions">{{ row.versionCount }} 个版本</span>
              </p>

              <!-- 页脚贴卡片底边：同一排卡片标题行数不同，日期与金额也要落在同一条线上 -->
              <div class="dev-home__delivery-foot">
                <span class="dev-home__delivery-time">{{ row.updatedAt ? formatCnDateTime(row.updatedAt) : '—' }}</span>
                <strong v-if="row.amount != null" class="dev-home__delivery-amount">
                  {{ money(row.amount) }}
                </strong>
                <span v-else class="dev-home__delivery-amount dev-home__delivery-amount--pending">未到账</span>
              </div>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>当前筛选下没有交付记录</strong>
          </p>
        </section>
      </div>

      <aside class="dev-home__aside">
        <!-- 收入、提现、保证金本来分装在两张卡里：「待提现」在一张里报金额、在另一张里报占比，
             「可提现」又被大数与比例条各说一遍。合并成一张「资金概览」，同一笔钱全页只出现一次。 -->
        <section class="dev-surface-card dev-home__panel dev-home__fund">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">资金概览</h3>
            </div>
          </div>

          <!-- 收入走势与余额两组：桌面上下排，平板档左右并排（见样式 641–980 档） -->
          <div class="dev-home__fund-trend">
          <!-- 「今日收入」是这一栏唯一带「今天」口径的读数，环比就跟在它旁边 -->
          <div class="dev-home__income-head">
            <span class="dev-home__income-label">今日收入</span>
            <strong class="dev-figure dev-figure--ink">{{ money(overview?.today_income_cny) }}</strong>
            <span v-if="changeRateText" class="dev-home__trend"
              :class="changeRate != null && changeRate < 0 ? 'dev-home__trend--down' : ''"
              :title="'今日到账较昨日的环比'">
              {{ changeRateText }} 较昨日
            </span>
          </div>

          <div class="dev-home__trend-head">
            <p class="dev-home__group-label">近 {{ chartDays }} 天到账</p>
            <!-- 本月累计只在看板上出现：快照才有按自然月汇总的口径 -->
            <p v-if="liveBoard" class="dev-home__month">
              <span>本月累计到账</span>
              <strong>{{ money(liveBoard.month_income_cny) }}</strong>
            </p>
          </div>

          <!-- 走势图：坐标换算与悬停状态在 useIncomeChart，画在 DevIncomeTrendChart；
               这里只给「取哪几天的数」与图上 title 的口径说明 -->
          <DevIncomeTrendChart :buckets="incomeBuckets" :caption="chartCaption" />
          </div>

          <div class="dev-home__fund-balance">
          <!-- 提现口径：大数只报可提现余额，另两笔金额各报一次（原先还得先读比例条再读图例） -->
          <div class="dev-home__money">
            <div class="dev-home__money-head">
              <span class="dev-home__money-figure">
                <span class="dev-home__money-label">可提现余额</span>
                <strong class="dev-figure">{{ money(withdrawable) }}</strong>
              </span>
              <!-- 提现按钮就贴在余额右侧：这一段的主操作只有一个，不必再排一行页脚。
                   点了就地拉起提现弹窗（与收益钱包页共用同一个），不再跳到钱包页。 -->
              <button class="dev-btn dev-btn--primary dev-home__money-action" type="button"
                @click="withdrawDialog?.open()">
                <TIcon>
                  <Wallet />
                </TIcon>
                <span>提现</span>
              </button>
            </div>

            <!-- 两个读数并成一行：提现口径只有这两笔，收入口径的读数已经在上面（今日收入、曲线） -->
            <dl class="dev-home__facts">
              <div class="dev-home__fact">
                <span class="dev-home__fact-icon dev-home__fact-icon--gold" aria-hidden="true">
                  <TIcon>
                    <Clock />
                  </TIcon>
                </span>
                <div class="dev-home__fact-copy">
                  <dt>待提现</dt>
                  <dd>{{ money(pendingWithdraw) }}</dd>
                </div>
              </div>

              <div class="dev-home__fact">
                <span class="dev-home__fact-icon dev-home__fact-icon--cyan" aria-hidden="true">
                  <TIcon>
                    <CircleCheck />
                  </TIcon>
                </span>
                <div class="dev-home__fact-copy">
                  <dt>已提现</dt>
                  <dd>{{ money(paidWithdraw) }}</dd>
                </div>
              </div>
            </dl>
          </div>

          <!-- 保证金是这一栏唯一带操作、也是唯一会阻断接单的一段：
               给它浅蓝内嵌底 + 状态胶囊，与上面纯读数的收入、提现两段分开。 -->
          <div class="dev-home__deposit">
            <div class="dev-home__deposit-head">
              <span class="dev-home__money-label">可用保证金</span>
              <span v-if="depositStatusChip" class="dev-chip dev-home__chip" :class="depositStatusChip.className">
                {{ depositStatusChip.label }}
              </span>
            </div>

            <div class="dev-home__deposit-figure">
              <strong class="dev-figure dev-figure--sm dev-figure--ink">{{ money(deposit?.available_cny) }}</strong>
              <button class="dev-btn dev-btn--ghost dev-home__deposit-action" type="button"
                @click="rechargeDialog?.open()">
                <TIcon>
                  <Money />
                </TIcon>
                <span>立即充值</span>
              </button>
            </div>

            <p class="dev-home__deposit-meta">
              <span>冻结 {{ money(deposit?.frozen_cny) }}</span>
              <span>累计充值 {{ money(deposit?.total_paid_cny) }}</span>
            </p>
          </div>
          </div>
        </section>
      </aside>

      <!-- 看板第三栏：实时动态流 + 资源项目概况，只在全屏且拿到快照后出现 -->
      <div v-if="liveBoard" class="dev-home__live">
        <section class="dev-surface-card dev-home__panel dev-home__feed-panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">实时动态</h3>
            </div>
          </div>

          <TransitionGroup v-if="feedRows.length" tag="ul" class="dev-home__feed" name="dev-home-feed"
            :css="feedAnimated" aria-live="polite">
            <li v-for="row in feedRows" :key="row.key" class="dev-home__feed-item">
              <span class="dev-home__feed-icon" :class="`dev-home__feed-icon--${row.tone}`" aria-hidden="true">
                <TIcon>
                  <component :is="row.icon" />
                </TIcon>
              </span>
              <div class="dev-home__feed-copy">
                <strong class="dev-home__feed-title">{{ row.title }}</strong>
                <span class="dev-home__feed-meta">
                  <time :datetime="row.fullTime" :title="row.fullTime">{{ row.time }}</time>
                  <template v-if="row.requirementId"> · {{ row.requirementId }}</template>
                </span>
              </div>
              <strong v-if="row.amount != null" class="dev-home__feed-amount"
                :class="`dev-home__feed-amount--${row.tone}`">
                {{ signedMoney(row.amount) }}
              </strong>
            </li>
          </TransitionGroup>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>暂无动态</strong>
          </p>
        </section>

        <section class="dev-surface-card dev-home__panel dev-home__resources-panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">资源项目</h3>
            </div>
          </div>
          <dl class="dev-home__resources">
            <div v-for="cell in resourceCells" :key="cell.key" class="dev-home__resource">
              <dt>
                <TIcon>
                  <component :is="cell.icon" />
                </TIcon>
                {{ cell.label }}
              </dt>
              <dd>{{ formatCount(cell.value) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>

    <!-- 保证金充值弹窗：与收益钱包页共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />

    <!-- 收入提现弹窗：提交成功后只回刷钱包读数，其余三块与本页的提现无关 -->
    <DevWithdrawalDialog ref="withdrawDialog" @submitted="reloadWallet" />
  </div>
</template>

<style scoped>
/* 本页只用开发者体系令牌（--dev-*）：顶部读数条 → 左列表右资金卡。
   口径与颜色沿用收益钱包那一套，见 doc/设计规范.md 第一节。 */
/* 加载中压暗数据区，避免把「还没拿到数据」误读成真实的 0 */
.dev-home--loading .dev-home__panel {
  opacity: 0.6;
}

.dev-home__panel {
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
  background: var(--dev-bg, #f1f4fb);
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

.dev-home__live {
  grid-area: live;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

/* 列表卡：卡片头 + 工具栏固定，列表本体在卡内滚动 */
.dev-home--fullscreen .dev-home__main .dev-home__panel,
.dev-home__live .dev-home__feed-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 项目行 hover 底色靠负外边距伸出去，滚动容器会把它算成横向溢出：
   容器自己先向两侧借 10px 内边距，行就落回容器内 */
.dev-home--fullscreen .dev-home__projects,
.dev-home--fullscreen .dev-home__deliveries,
.dev-home__feed {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 -10px;
  padding: 0 10px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.dev-home--fullscreen .dev-home__deliveries {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-content: start;
  padding-bottom: 2px;
}

/* 读数条在看板里：读数改成「标签在上、数字在下」，数字放大一档，远处也看得清 */
.dev-home--fullscreen .dev-meta-strip {
  gap: 14px 18px;
}

.dev-home--fullscreen .dev-meta-strip__item:not(.dev-meta-strip__action) {
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.dev-home--fullscreen .dev-meta-strip__value {
  font-size: 20px;
  font-weight: 800;
}

.dev-home__clock {
  display: grid;
  gap: 1px;
}

.dev-home__clock-time {
  color: var(--dev-ink);
  font-size: 24px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.dev-home__clock-date,
.dev-home__updated {
  color: var(--dev-muted);
  font-size: 12px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dev-home__live-state {
  display: grid;
  gap: 3px;
}

.dev-home__lamp {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--dev-ink-soft);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.dev-home__lamp-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--dev-muted);
}

.dev-home__lamp--ok {
  color: var(--dev-cyan);
}

.dev-home__lamp--ok .dev-home__lamp-dot {
  background: var(--dev-cyan);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--dev-cyan) 45%, transparent);
  animation: dev-home-lamp-pulse 2s ease-out infinite;
}

.dev-home__lamp--warn {
  color: var(--dev-gold);
}

.dev-home__lamp--warn .dev-home__lamp-dot {
  background: var(--dev-gold);
  animation: dev-home-lamp-blink 1s ease-in-out infinite;
}

.dev-home__lamp--off {
  color: var(--dev-muted);
}

@keyframes dev-home-lamp-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--dev-cyan) 45%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 7px transparent;
  }
}

@keyframes dev-home-lamp-blink {
  50% {
    opacity: 0.35;
  }
}

/* 漏斗的静态排布搬进了 DevFunnel.vue（scoped 样式跟着组件走）；这里只留 900 / 640 两档的窄屏覆盖，
   见文件末尾的媒体块——`:deep()` 只能在「持有子组件的那一层」编译成后代选择器。 */

/* 资金卡里「近 N 天到账」与「本月累计到账」同一行，标签左、累计右 */
.dev-home__trend-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.dev-home__month {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  margin: 14px 0 0;
  color: var(--dev-muted);
  font-size: 12px;
}

.dev-home__month strong {
  color: var(--dev-gold);
  font-size: 16px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

/* 30 天横轴的抽稀标签（.dev-home__chart-axis-labels--sparse）跟着图表搬进了 DevIncomeTrendChart。 */

/* 实时动态：图标 + 标题 / 时间 + 金额。新条目从顶部插入并闪一下底色 */
.dev-home__feed {
  display: grid;
  align-content: start;
  list-style: none;
}

.dev-home__feed-item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  margin: 0 -10px;
  padding: 9px 10px;
  border-bottom: 1px solid var(--dev-line);
  border-radius: 10px;
}

.dev-home__feed-item:last-child {
  border-bottom: 0;
}

.dev-home__feed-icon {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 15px;
}

.dev-home__feed-icon--gold {
  background: color-mix(in srgb, var(--dev-gold) 14%, transparent);
  color: var(--dev-gold);
}

.dev-home__feed-icon--cyan {
  background: color-mix(in srgb, var(--dev-cyan) 14%, transparent);
  color: var(--dev-cyan);
}

.dev-home__feed-icon--muted {
  background: color-mix(in srgb, var(--dev-muted) 14%, transparent);
  color: var(--dev-ink-soft);
}

.dev-home__feed-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.dev-home__feed-title {
  overflow: hidden;
  color: var(--dev-ink);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dev-home__feed-meta {
  overflow: hidden;
  color: var(--dev-muted);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}

.dev-home__feed-amount {
  color: var(--dev-ink-soft);
  font-size: 14px;
  font-weight: 800;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.dev-home__feed-amount--gold {
  color: var(--dev-gold);
}

.dev-home-feed-enter-active {
  animation: dev-home-feed-in 1.6s ease-out;
}

.dev-home-feed-move {
  transition: transform 0.35s ease;
}

.dev-home-feed-leave-active {
  display: none;
}

@keyframes dev-home-feed-in {
  0% {
    opacity: 0;
    transform: translateY(-10px);
    background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  }
  18% {
    opacity: 1;
    transform: translateY(0);
    background: color-mix(in srgb, var(--dev-blue) 14%, transparent);
  }
  100% {
    background: transparent;
  }
}

/* 资源项目：三格读数一排 */
.dev-home__resources {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.dev-home__resource {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
}

.dev-home__resource dt {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--dev-muted);
  font-size: 12px;
  white-space: nowrap;
}

.dev-home__resource dd {
  margin: 0;
  color: var(--dev-ink);
  font-size: 22px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
  .dev-home__lamp-dot,
  .dev-home-feed-enter-active {
    animation: none;
  }
}

.dev-home--fullscreen .dev-home__money-action,
.dev-home--fullscreen .dev-home__deposit-action,
.dev-home--fullscreen .dev-notice__action,
.dev-home--fullscreen .dev-home__mock-hint {
  display: none;
}

.dev-home__screen-title {
  margin-right: 8px;
  color: var(--dev-ink);
  font-size: 16px;
  font-weight: 800;
  white-space: nowrap;
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

/* 保证金不足的提示条已改用统一层的 .dev-notice（金色 + 图标徽标 + 文案 + 右侧动作），
   本页不再自带这一套。 */

/* 四格统计卡：图标 + 口径数字 + 箭头，整卡可点 */
/* 左栏是两条列表，右栏是两张资金卡；窄屏并成一栏 */
/* 两栏等高、左栏最后一张卡吃掉剩余高度：总览是拿来「看」的，两栏底边不齐会在下方留出一块空洞 */
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

/* 资金卡：顶部一层很淡的主色渐变，把「看数」这一栏从左侧两张列表卡里拎出来 */
.dev-home__panel.dev-home__fund {
  background:
    radial-gradient(120% 60% at 100% 0, color-mix(in srgb, var(--dev-blue) 10%, transparent), transparent 70%),
    var(--dev-surface-strong);
}

/* 卡片内边距由统一层给（桌面 24px、≤720px 20px、≤640px 16px），见 dev-base.css
   与 dev-responsive.css 的 .dev-surface-card:not(.el-card)，本页不再单独写。 */

/* 卡片内的小节标签：右栏把收入 / 提现 / 保证金并成一张卡后，用它给各段起头 */
.dev-home__group-label {
  margin: 14px 0 0;
  color: var(--dev-muted);
  font-size: 13px;
}

/* 列表内的筛选标签走统一层的 .dev-toolbar + .dev-chip-group / .dev-chip--button，
   位置与其它菜单页一致（卡片头下方），卡片头右侧只留「查看全部」这个动作 */
.dev-home__tabs {
  margin: 0;
}

.dev-home__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--dev-blue);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.dev-home__more .t73-icon {
  transition: transform 0.2s ease;
}

.dev-home__more:hover .t73-icon {
  transform: translateX(2px);
}

.dev-home__more:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
  border-radius: 8px;
}

/* 项目行：图标 + 正文（编号 / 数字 / 进度条），行与行之间只用分隔线 */
.dev-home__projects {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 每条项目只占两行：标题 + 状态，以及「编号 · 预算 · 更新时间」+ 进度。
   原来还有一列装饰性图标和一行独立数字——图标每行都相同、不承载信息，
   数字另起一行则白占一行高度；合并后单条约 63px（原 119px），一屏能多放近一倍。
   整行可点（跳到「我的接单」并定位这一单），所以左右各留出内边距给 hover 底色，
   再用负外边距把文字拉回与卡片头对齐的位置。 */
.dev-home__project {
  display: grid;
  gap: 5px;
  margin: 0 -10px;
  padding: 11px 10px;
  border-bottom: 1px solid var(--dev-line);
  border-radius: 10px;
  cursor: pointer;
  transition: background 140ms ease;
}

.dev-home__project:hover {
  background: color-mix(in srgb, var(--dev-blue) 5%, transparent);
}

.dev-home__project:focus-visible,
.dev-home__delivery:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
}

.dev-home__project:first-child {
  padding-top: 6px;
}

.dev-home__project:last-child {
  padding-bottom: 6px;
  border-bottom: 0;
}

/* 最近交付是三列卡片而不是行列表：一张卡只讲一次交付，
   行列表在这里信息密度过低（右侧大片留白），见设计规范第五节。
   整卡可点（跳到「我的接单」并定位这一单），hover 与 focus 的反馈见下。 */
.dev-home__deliveries {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev-home__delivery {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--dev-line);
  border-radius: 12px;
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--dev-cyan) 7%, transparent), transparent 55%),
    var(--dev-surface-strong);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.dev-home__delivery:hover {
  border-color: color-mix(in srgb, var(--dev-cyan) 36%, transparent);
  box-shadow: 0 12px 24px color-mix(in srgb, var(--dev-cyan) 10%, transparent);
}

/* 项目行不再带图标：每行的图标都相同、不承载信息，去掉后标题能与面板标题左对齐。
   图标只留给交付卡，且比原尺寸矮一档——三列宽的卡片上 38px 会把标题挤掉两三个字。 */
.dev-home__delivery-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--dev-cyan) 12%, transparent);
  color: var(--dev-cyan);
  font-size: 16px;
}

/* 第二行：左侧「编号 · 预算 · 更新时间」，右侧进度。
   进度列给固定宽，用 auto 的话只按读数文字算宽、轨道会被挤成 0。 */
.dev-home__project-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  align-items: center;
  gap: 4px 14px;
  min-width: 0;
}

.dev-home__project-foot .dev-home__progress {
  min-width: 0;
}

.dev-home__project-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.dev-home__delivery-top {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dev-home__project-title,
.dev-home__delivery-title {
  min-width: 0;
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

/* 行内标签比 .dev-chip 默认形态矮一档，避免把行撑高。
   中性档（终止态、「未关联」这类无强调语义的标签）不再自带变体，
   统一用统一层的 .dev-chip--muted，免得同一档颜色在总览页与其它页各有一份。 */
.dev-home__chip {
  flex: 0 0 auto;
  padding: 4px 10px;
}

.dev-home__project-meta,
.dev-home__delivery-meta {
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

/* 预算读数跟在「预算」二字后面，不再单独占一行，所以只加深、加粗即可：
   字号与 tabular-nums 都从 .dev-home__project-meta 继承。 */
.dev-home__project-amount {
  color: var(--dev-ink);
  font-weight: 700;
}

/* 进度：轨道 + 按状态着色的填充，读数写在右侧 */
.dev-home__progress {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.dev-home__progress-track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dev-muted) 22%, transparent);
  overflow: hidden;
}

.dev-home__progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--dev-blue);
  transition: width 0.3s ease;
}

.dev-home__progress-fill--gold {
  background: var(--dev-gold);
}

.dev-home__progress-fill--cyan {
  background: var(--dev-cyan);
}

.dev-home__progress-fill--muted {
  background: color-mix(in srgb, var(--dev-muted) 70%, transparent);
}

.dev-home__progress-text {
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dev-home__delivery-check {
  flex: 0 0 auto;
  margin-left: auto;
  color: var(--dev-cyan);
  font-size: 16px;
}

/* 交付卡页脚：日期贴左，版本胶囊居中，金额靠右 —— 金额是这张卡最想让人看到的一格 */
.dev-home__delivery-amount {
  margin-left: auto;
  color: var(--dev-gold);
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dev-home__delivery-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px dashed var(--dev-line);
}

.dev-home__delivery-amount--pending {
  color: var(--dev-muted);
  font-size: 12px;
  font-weight: 600;
}

.dev-home__delivery-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  white-space: nowrap;
}

.dev-home__delivery-versions {
  flex-shrink: 0;
}

.dev-home__delivery-id,
.dev-home__delivery-time {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-home__delivery-versions {
  color: var(--dev-cyan);
  font-weight: 700;
}

.dev-home__panel > .dev-card-head:has(.dev-home__head-main) {
  align-items: center;
}

/* 交付卡标题最多两行，三张卡的标题区等高，下面的编号与页脚才对得齐 */
.dev-home__delivery-title {
  display: -webkit-box;
  min-height: calc(14px * 1.45 * 2);
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}

/* 卡头：标题与筛选胶囊同一行，窄了胶囊整组落到标题下面 */
.dev-home__head-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 14px;
}

/* 项目行左侧一道状态色条：一眼扫过去就分得清开发中 / 待付尾款 / 已完成，不必逐个读胶囊 */
.dev-home__project {
  position: relative;
  padding-left: 16px;
}

.dev-home__project::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 4px;
  width: 3px;
  border-radius: 999px;
  background: var(--dev-blue);
}

.dev-home__project:first-child::before {
  top: 7px;
}

.dev-home__project:last-child::before {
  bottom: 7px;
}

.dev-home__project--gold::before {
  background: var(--dev-gold);
}

.dev-home__project--cyan::before {
  background: var(--dev-cyan);
}

.dev-home__project--muted::before {
  background: color-mix(in srgb, var(--dev-muted) 50%, transparent);
}

.dev-home__delivery-time {
  color: var(--dev-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 收入：今日收入大数 + 环比 + 近 7 天折线（累计收入留给页面顶部的四格统计卡） */
.dev-home__income-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}

.dev-home__income-label {
  color: var(--dev-muted);
  font-size: 13px;
}

.dev-home__trend {
  padding: 3px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dev-cyan) 12%, transparent);
  color: var(--dev-cyan);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dev-home__trend--down {
  background: color-mix(in srgb, var(--dev-gold) 12%, transparent);
  color: var(--dev-gold);
}

/* 走势图的排版（框、svg、折线、圆点、悬停胶囊与命中带）整套搬进了 DevIncomeTrendChart.vue，
   连同 scoped 样式一起走，这里不再留残留规则。 */


/* 读数格：两列一行，图标 + 标签 + 数字。合并后只剩提现口径的两个读数 */
.dev-home__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
  margin: 14px 0 0;
  padding-top: 14px;
  border-top: 1px solid var(--dev-line);
}

.dev-home__fact {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dev-home__fact-icon {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: var(--wb-accent-soft);
  color: var(--dev-blue);
  font-size: 16px;
}

.dev-home__fact-icon--gold {
  background: color-mix(in srgb, var(--dev-gold) 14%, transparent);
  color: var(--dev-gold);
}

.dev-home__fact-icon--cyan {
  background: color-mix(in srgb, var(--dev-cyan) 14%, transparent);
  color: var(--dev-cyan);
}

.dev-home__fact-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dev-home__fact-copy dt {
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.3;
}

.dev-home__fact-copy dd {
  margin: 0;
  color: var(--dev-ink);
  font-size: 15px;
  font-weight: 800;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* 提现：可提现大数（右侧贴提现按钮）+ 两个口径读数，再往下是保证金。
   原先那条「可提现 / 待提现」比例条与图例只把这两个数换成百分比又说了一遍，已删。 */
.dev-home__money {
  display: grid;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--dev-line);
}

.dev-home__money-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 14px;
}

.dev-home__money-figure {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.dev-home__money-action {
  flex: 0 0 auto;
}

.dev-home__money-label {
  color: var(--dev-muted);
  font-size: 13px;
}

/* 保证金：这一栏三段里唯一带操作、也是唯一会阻断接单的一段。
   前两段（收入、提现）已经各有一条 hairline 起头，第三段再来一条只是「又一段」；
   改用浅蓝内嵌块把它从卡片里拎出来，底色取自主色 --dev-blue。 */
.dev-home__deposit {
  display: grid;
  gap: 10px;
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--wb-accent-line);
  border-radius: var(--dev-radius-inner);
  background: var(--wb-accent-soft);
}

/* 首行：标签在左、接单状态在右。状态才用胶囊；原先「冻结 / 累计充值」两笔读数也用胶囊装，
   而 .dev-chip 是「浅底 + 深字」的状态形态，装金额会与真正的状态标签混作一谈。 */
.dev-home__deposit-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* 次行：大数在左、充值按钮同排——与上面「可提现余额 + 提现」同一套排法。
   读数与按钮各占一头，中间留白由 space-between 吃掉，窄到摆不下时按钮整块落到下一行。 */
.dev-home__deposit-figure {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

/* 冻结与累计充值并成一行脚注：它们只在充值那一下才需要看，各占一枚胶囊会把这一段撑成三行 */
.dev-home__deposit-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  margin: 0;
  color: var(--dev-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* 分隔点由样式给出，模板里少一个纯装饰节点；换行时它会跟着第二个读数一起落行 */
.dev-home__deposit-meta span + span::before {
  content: '·';
  margin-right: 6px;
  color: var(--dev-muted);
}

/* 按钮：本页原先自带一套 .dev-home__button（圆角 10px、42px 高、悬停压深底色，
   并把 #173aaa / #96661f / #475569 写死）。现已并入统一层 .dev-btn / --primary /
   --gold / --ghost，见 src/styles/dev-base.css，这里只留本页的排布钩子。 */
.dev-home__money-action,
.dev-home__deposit-action {
  flex: 0 0 auto;
}

/* 900：双栏并一栏；交付卡片三列降两列 */
/* R047 断点收敛：原档位 980px → 900px */
@media (max-width: 900px) {
  .dev-home__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .dev-home__deliveries {
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

  .dev-home__fund {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    column-gap: 24px;
    align-items: start;
  }

  .dev-home__fund > .dev-card-head {
    grid-column: 1 / -1;
  }

  .dev-home__fund-balance {
    padding-left: 24px;
    border-left: 1px solid var(--dev-line);
  }

  .dev-home__fund-balance .dev-home__money {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

@media (max-width: 640px) {
  /* 触屏档：列表行撑满一列，可点目标不小于 44px */
  .dev-home__deliveries,
  .dev-home__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 筛选胶囊在触屏档的高度由统一层给（dev-responsive.css 的 36px，与门户侧 .wb-chip--button 同档），
     总览页原来在这里自己写 32px，于是同一组筛选胶囊在总览页 32px、在需求大厅 36px。 */

  .dev-home__more {
    min-height: 44px;
  }

  /* 项目行在触屏档：编号行独占整宽并允许折行，进度整块落到下一行，条与读数仍同行 */
  .dev-home__project-foot {
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }

  .dev-home__progress {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }

  /* 触屏档不再单独压字号：统一层的 30px 在窄屏卡片里放得下（实测读数区最宽 342px 不溢出），
     单压总览页会让同一笔钱在总览与收益钱包两页大小不一，切菜单时数字会跳。 */

  /* 内嵌块跟着卡片一起收窄，否则卡片 16px 内边距下这块只剩一层薄框 */
  .dev-home__deposit {
    padding: 12px;
  }

  /* 触屏档按钮撑满整行并抬到 44px：36px 的可点面积不达标，见设计规范第六节 */
  .dev-home__money-action,
  .dev-home__deposit-action,
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

  .dev-home--fullscreen .dev-home__deliveries {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 统一层在这一档把读数条改成两列网格（菜单页里读数少、一格一行）；看板上读数多，
     两列会把它撑到四五行高。看板里改回横排：首行标题 + 时钟 + 状态，次行四格读数 + 按钮 */
  .dev-home--fullscreen .dev-meta-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 20px;
    padding: 12px 18px;
  }

  .dev-home--fullscreen .dev-meta-strip__divider {
    display: block;
  }

  .dev-home--fullscreen .dev-home__live-divider {
    flex: 0 0 100%;
    width: auto;
    height: 1px;
  }

  .dev-home--fullscreen .dev-meta-strip__item.dev-meta-strip__action {
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

  .dev-home--fullscreen .dev-home__projects,
  .dev-home--fullscreen .dev-home__deliveries,
  .dev-home__feed {
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
