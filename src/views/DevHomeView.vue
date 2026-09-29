<script setup lang="ts">
import {
  ArrowRight,
  CircleCheck,
  Clock,
  Money,
  Promotion,
  Refresh,
  Wallet,
  WarningFilled,
} from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import DevWithdrawalDialog from '@/components/DevWithdrawalDialog.vue'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import {
  getDevWalletOverview,
  type DevWalletIncomeItem,
  type DevWalletOverview,
} from '@/api/devWallet'
import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { useToast } from '@/composables/useToast'
import {
  DEMO_DEV_HOME_DAILY_INCOME,
  DEMO_DEV_HOME_DEPOSIT,
  DEMO_DEV_HOME_REQUIREMENTS,
  DEMO_DEV_HOME_RESOURCES,
  DEMO_DEV_HOME_WALLET,
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

type DevHomeIncomeBucket = {
  label: string
  value: number
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { showToast } = useToast()

const loading = ref(false)
const overview = ref<DevWalletOverview | null>(null)
const deposit = ref<DevOrderDepositStatus | null>(null)
const requirements = ref<RequirementItem[]>([])
const resources = ref<McResourcePayload[]>([])

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

/** 四格统计卡读数：三格按接单状态分档，收入固定取后端给的累计到账金额。 */
const statCards = computed<DevHomeStatCard[]>(() => [
  {
    label: '进行中项目',
    value: String(activeProjectCount.value),
  },
  {
    label: '已完成项目',
    value: String(completedProjectCount.value),
  },
  {
    label: '待交付',
    value: String(pendingDeliveryCount.value),
  },
  {
    label: '累计收入',
    value: money(overview.value?.total_income_cny),
  },
])

/** 终止态不进总览列表：那是已经结束的接单，留在「我的接单」里查。 */
const openRequirements = computed(() =>
  requirements.value.filter((item) => item.status !== 'cancelled' && item.status !== 'rejected'),
)

const projectRows = computed<DevHomeProjectRow[]>(() => {
  const filtered = openRequirements.value.filter((item) => {
    if (activeProjectTab.value === 'active') {
      return isActiveRequirement(item.status)
    }
    if (activeProjectTab.value === 'pending') {
      return item.status === 'pending_final'
    }
    if (activeProjectTab.value === 'completed') {
      return item.status === 'completed'
    }

    return true
  })

  return [...filtered]
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, OVERVIEW_LIST_LIMIT)
    .map((item) => ({
      requirementId: item.requirement_id,
      title: item.title,
      status: item.status,
      statusLabel: requirementStatusLabel(item.status),
      tone: STATUS_TONES[item.status] ?? 'blue',
      createdAt: item.created_time,
      updatedAt: item.updated_at,
      budget: item.budget ?? null,
      progress: requirementProgressPercent(item.status),
    }))
})

/** 交付 = 绑定资源项目的资源版本，所以最近交付按「已绑定资源的需求单」汇总。 */
const deliveryRows = computed<DevHomeDeliveryRow[]>(() =>
  [...requirements.value]
    .filter((item) => item.bound_resource_id != null)
    .filter((item) => {
      if (activeDeliveryTab.value === 'delivered') {
        return (item.bound_resource_version_count ?? 0) > 0
      }
      if (activeDeliveryTab.value === 'pending') {
        return (item.bound_resource_version_count ?? 0) === 0
      }

      return true
    })
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, DELIVERY_GRID_LIMIT)
    .flatMap((item) => {
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
    }),
)

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

/** 曲线口径：近 7 天（含今天）的到账金额，最早一天在左。 */
const CHART_BUCKETS = 7
const CHART_WIDTH = 320
const CHART_HEIGHT = 104
const CHART_PAD_X = 10
const CHART_PAD_TOP = 16
const CHART_PAD_BOTTOM = 10

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 后端没有时间序列接口：演示模式用自带序列，真实模式把最近到账记录按到账日归集。
 * 真实模式下接口最多只返回 100 笔，所以这条曲线是「最近到账的分布」，不是完整流水。
 */
const incomeBuckets = computed<DevHomeIncomeBucket[]>(() => {
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

const chartMax = computed(() => incomeBuckets.value.reduce((max, bucket) => Math.max(max, bucket.value), 0))
const hasIncomeData = computed(() => chartMax.value > 0)

/** 折线与面积共用同一串坐标：横向铺满、纵向按最大值等比缩放。 */
const chartGeometry = computed(() => {
  const buckets = incomeBuckets.value
  const usableWidth = CHART_WIDTH - CHART_PAD_X * 2
  const usableHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM
  const step = buckets.length > 1 ? usableWidth / (buckets.length - 1) : 0
  const baseline = CHART_HEIGHT - CHART_PAD_BOTTOM

  const points = buckets.map((bucket, index) => {
    const ratio = chartMax.value > 0 ? bucket.value / chartMax.value : 0

    return {
      ...bucket,
      x: CHART_PAD_X + step * index,
      y: baseline - ratio * usableHeight,
    }
  })

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  const area =
    first && last
      ? `${line} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z`
      : ''

  return { points, line, area, baseline }
})

/** 最高一天的读数标在它自己上方；贴边时把标签拉回画布内，避免溢出卡片。 */
const peakIndex = computed(() =>
  incomeBuckets.value.reduce((best, bucket, index) => (bucket.value > (incomeBuckets.value[best]?.value ?? 0) ? index : best), 0),
)

const peakLabel = computed(() => money(incomeBuckets.value[peakIndex.value]?.value))

/** 悬停读数胶囊在两端翻边的阈值（百分比）：胶囊比「最高一天」那颗宽，居中会溢出去。 */
const TIP_EDGE_PERCENT = 16

/** 把第 index 天的横向位置换算成百分比；贴边时拉回画布内（「最高一天」那颗读数用）。 */
function bucketLeftPercent(index: number): string {
  const lastIndex = incomeBuckets.value.length - 1
  if (lastIndex <= 0) {
    return '50%'
  }

  const percent = (index / lastIndex) * 100
  return `${Math.min(88, Math.max(12, percent)).toFixed(1)}%`
}

const peakLabelLeft = computed(() => bucketLeftPercent(peakIndex.value))

/**
 * 鼠标悬停（或键盘聚焦）的那一天：曲线本身只是一条线，不悬停看不出每天各到账多少，
 * 所以每一天铺一条命中带，指上去就在它头顶报「日期 · 金额」，并把圆点放大、画一条竖线。
 * 没有命中带时只有最高一天那颗读数。
 */
const hoveredBucketIndex = ref<number | null>(null)

const hoveredBucket = computed(() => {
  const index = hoveredBucketIndex.value
  if (index == null) {
    return null
  }

  const bucket = incomeBuckets.value[index]
  const point = chartGeometry.value.points[index]
  const lastIndex = chartGeometry.value.points.length - 1
  if (!bucket || !point || lastIndex <= 0) {
    return null
  }

  const percent = (point.x / CHART_WIDTH) * 100
  // 头顶读数：始终以当天那个点为锚，贴到两端时把胶囊翻到点的内侧，免得被卡片裁掉
  // （它比「最高一天」那颗蓝胶囊宽，居中摆在最左/最右会溢出去）。竖线不参与收边，
  // 永远画在当天那个点上，两者不共用同一个横坐标。
  const tipTransform =
    percent <= TIP_EDGE_PERCENT
      ? 'translateX(0)'
      : percent >= 100 - TIP_EDGE_PERCENT
        ? 'translateX(-100%)'
        : 'translateX(-50%)'

  return {
    label: bucket.label,
    value: bucket.value,
    tipLeft: `${percent.toFixed(2)}%`,
    tipTransform,
    guideLeft: `${percent.toFixed(2)}%`,
    // 竖线从该点画到基线：点与基线都在 104px 高的画布里，直接换算成百分比给高度
    top: `${((point.y / CHART_HEIGHT) * 100).toFixed(1)}%`,
    height: `${(((chartGeometry.value.baseline - point.y) / CHART_HEIGHT) * 100).toFixed(1)}%`,
  }
})

/** 命中带的左右边界：以当天那个点为中心、各占与邻点间距的一半，最外侧两条各自收在画布边上。 */function bucketHitStyle(index: number): Record<string, string> {
  const lastIndex = chartGeometry.value.points.length - 1
  if (lastIndex <= 0) {
    return { left: '0%', right: '0%' }
  }

  const center = (chartGeometry.value.points[index]!.x / CHART_WIDTH) * 100
  const half = 100 / lastIndex / 2
  return {
    left: `${Math.max(0, center - half).toFixed(2)}%`,
    right: `${Math.max(0, 100 - center - half).toFixed(2)}%`,
  }
}

const chartCaption = computed(() =>
  mockEnabled ? '演示数据：近 7 天完整序列' : '按最近到账记录绘制（最多取最近 100 笔）',
)

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
    showToast('登录状态已失效，请重新登录', 'error')
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
    showToast(error instanceof Error ? error.message : '加载工作台总览失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="dev-page dev-home" :class="{ 'dev-home--loading': loading }">
    <p v-if="mockEnabled" class="dev-home__mock-hint" role="note">
      演示数据：本页未读取后端接口，仅用于预览布局。去掉地址上的 <code>?mock=1</code>，
      或清掉 <code>VITE_DEV_HOME_MOCK</code> 后重启 dev server，即恢复真实数据。
    </p>

    <!-- 顶部读数条：与其余菜单页同一条形态（读数在左、刷新在右）。
         四格可点卡片已并入横条：读数对应的明细页在侧边栏和下方列表里都有入口，
         不必在这一层再挂四条跳转。 -->
    <div class="dev-meta-strip" aria-label="接单与收入概览" v-loading="loading">
      <template v-for="(item, index) in statCards" :key="item.label">
        <div v-if="index > 0" class="dev-meta-strip__divider" />
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
        </div>
      </template>
      <div class="dev-meta-strip__item dev-meta-strip__action">
        <el-button class="dev-toolbar__icon-btn" aria-label="刷新概览" @click="loadPage">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
      </div>
    </div>

    <!-- 保证金警示条：摆在四格读数之后——先看当天读数，再看为什么还不能接单。
         形状与配色走统一层的 .dev-notice（金色 + 图标徽标 + 文案 + 右侧动作），
         与需求大厅的资格提示同一种横幅。 -->
    <section v-if="depositInsufficient" class="dev-notice" role="alert">
      <span class="dev-notice__icon" aria-hidden="true">
        <el-icon>
          <WarningFilled />
        </el-icon>
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

    <section class="dev-home__layout">
      <div class="dev-home__main">
        <section class="dev-surface-card dev-home__panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">进行中项目</h3>
            </div>
            <div class="dev-card-head__actions">
              <RouterLink class="dev-home__more" :to="{ name: 'dev-my-requirements' }">
                <span>查看全部</span>
                <el-icon>
                  <ArrowRight />
                </el-icon>
              </RouterLink>
            </div>
          </div>

          <!-- 状态胶囊是「筛选」，与其它菜单页一致放在卡片头下方的 .dev-toolbar 里，
               卡片头右侧只留「查看全部」这个动作 -->
          <div class="dev-toolbar">
            <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="进行中项目筛选">
              <button v-for="tab in PROJECT_TABS" :key="tab.key" class="dev-chip dev-chip--button" type="button"
                role="tab" :aria-selected="activeProjectTab === tab.key"
                :class="{ 'is-active': activeProjectTab === tab.key }" @click="activeProjectTab = tab.key">
                {{ tab.label }}
              </button>
            </div>
          </div>

          <ul v-if="projectRows.length" class="dev-home__projects">
            <li v-for="row in projectRows" :key="row.requirementId" class="dev-home__project" role="button" tabindex="0"
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
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">最近交付</h3>
            </div>
            <div class="dev-card-head__actions">
              <RouterLink class="dev-home__more" :to="{ name: 'dev-my-requirements' }">
                <span>查看全部</span>
                <el-icon>
                  <ArrowRight />
                </el-icon>
              </RouterLink>
            </div>
          </div>

          <div class="dev-toolbar">
            <div class="dev-chip-group dev-home__tabs" role="tablist" aria-label="最近交付筛选">
              <button v-for="tab in DELIVERY_TABS" :key="tab.key" class="dev-chip dev-chip--button" type="button"
                role="tab" :aria-selected="activeDeliveryTab === tab.key"
                :class="{ 'is-active': activeDeliveryTab === tab.key }" @click="activeDeliveryTab = tab.key">
                {{ tab.label }}
              </button>
            </div>
          </div>

          <ul v-if="deliveryRows.length" class="dev-home__deliveries">
            <li v-for="row in deliveryRows" :key="row.requirementId" class="dev-home__delivery" role="button" tabindex="0"
              :aria-label="`查看「${row.resourceTitle}」的交付与到账`" @click="openMyOrder(row.requirementId)"
              @keydown.enter.prevent="openMyOrder(row.requirementId)"
              @keydown.space.prevent="openMyOrder(row.requirementId)">
              <div class="dev-home__delivery-top">
                <span class="dev-home__delivery-icon" aria-hidden="true">
                  <el-icon>
                    <Promotion />
                  </el-icon>
                </span>
                <strong class="dev-home__delivery-title">{{ row.resourceTitle }}</strong>
                <!-- 交付过的打勾：卡片只看一行，没有勾就得逐字读版本数才知道交付没交付 -->
                <el-icon v-if="row.delivered" class="dev-home__delivery-check" aria-hidden="true">
                  <CircleCheck />
                </el-icon>
              </div>

              <p class="dev-home__delivery-meta">{{ row.requirementId }}</p>

              <div class="dev-home__delivery-foot">
                <span class="dev-home__delivery-time">{{ formatCnDateTime(row.updatedAt) }}</span>
                <span class="dev-chip dev-chip--cyan dev-home__chip">{{ row.versionCount }} 个版本</span>
                <strong v-if="row.amount != null" class="dev-home__delivery-amount">
                  {{ money(row.amount) }}
                </strong>
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
        <section class="dev-surface-card dev-home__panel">
          <div class="dev-card-head">
            <div class="dev-card-head__title-block">
              <h3 class="dev-section-title">资金概览</h3>
            </div>
          </div>

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

          <p class="dev-home__group-label">近 7 天到账</p>

          <div class="dev-home__chart" :title="chartCaption">
            <!-- 悬停时头顶换成那一天自己的读数（两颗都挂在同一个位置，同时出现会叠在一起） -->
            <span v-if="hoveredBucket" class="dev-home__chart-tip"
              :style="{ left: hoveredBucket.tipLeft, transform: hoveredBucket.tipTransform }">
              {{ hoveredBucket.label }} · {{ money(hoveredBucket.value) }}
            </span>
            <span v-else-if="hasIncomeData" class="dev-home__chart-peak" :style="{ left: peakLabelLeft }">
              {{ peakLabel }}
            </span>

            <span v-if="hoveredBucket" class="dev-home__chart-guide"
              :style="{ left: hoveredBucket.guideLeft, top: hoveredBucket.top, height: hoveredBucket.height }" />

            <svg class="dev-home__chart-svg" :viewBox="`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`"
              preserveAspectRatio="none" role="img" :aria-label="`近 7 天到账金额，最高一天 ${peakLabel}`">
              <defs>
                <linearGradient id="devHomeIncomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop class="dev-home__chart-stop-a" offset="0%" />
                  <stop class="dev-home__chart-stop-b" offset="100%" />
                </linearGradient>
              </defs>
              <line class="dev-home__chart-axis" x1="0" :x2="CHART_WIDTH" :y1="chartGeometry.baseline"
                :y2="chartGeometry.baseline" />
              <template v-if="hasIncomeData">
                <path class="dev-home__chart-area" :d="chartGeometry.area" fill="url(#devHomeIncomeFill)" />
                <path class="dev-home__chart-line" :d="chartGeometry.line" vector-effect="non-scaling-stroke" />
                <circle v-for="(point, index) in chartGeometry.points" :key="point.label" class="dev-home__chart-dot"
                  :class="{ 'is-peak': index === peakIndex, 'is-active': index === hoveredBucketIndex }"
                  :cx="point.x" :cy="point.y"
                  :r="index === hoveredBucketIndex ? 4 : index === peakIndex ? 3.5 : 2"
                  vector-effect="non-scaling-stroke" />
              </template>
            </svg>

            <!-- 每天一条命中带：指到哪一天就在头顶报那一天的金额，键盘 Tab 也能逐天读 -->
            <div v-if="hasIncomeData" class="dev-home__chart-hits">
              <button v-for="(point, index) in chartGeometry.points" :key="point.label" type="button"
                class="dev-home__chart-hit" :style="bucketHitStyle(index)"
                :aria-label="`${point.label} 到账 ${money(point.value)}`" @mouseenter="hoveredBucketIndex = index"
                @mouseleave="hoveredBucketIndex = null" @focus="hoveredBucketIndex = index"
                @blur="hoveredBucketIndex = null" />
            </div>

            <div class="dev-home__chart-axis-labels" aria-hidden="true">
              <span v-for="bucket in incomeBuckets" :key="bucket.label">{{ bucket.label }}</span>
            </div>
          </div>

          <p v-if="!hasIncomeData" class="dev-home__chart-empty">近 7 天没有到账记录</p>

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
                <el-icon>
                  <Wallet />
                </el-icon>
                <span>提现</span>
              </button>
            </div>

            <!-- 两个读数并成一行：提现口径只有这两笔，收入口径的读数已经在上面（今日收入、曲线） -->
            <dl class="dev-home__facts">
              <div class="dev-home__fact">
                <span class="dev-home__fact-icon dev-home__fact-icon--gold" aria-hidden="true">
                  <el-icon>
                    <Clock />
                  </el-icon>
                </span>
                <div class="dev-home__fact-copy">
                  <dt>待提现</dt>
                  <dd>{{ money(pendingWithdraw) }}</dd>
                </div>
              </div>

              <div class="dev-home__fact">
                <span class="dev-home__fact-icon dev-home__fact-icon--cyan" aria-hidden="true">
                  <el-icon>
                    <CircleCheck />
                  </el-icon>
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
                <el-icon>
                  <Money />
                </el-icon>
                <span>立即充值</span>
              </button>
            </div>

            <p class="dev-home__deposit-meta">
              <span>冻结 {{ money(deposit?.frozen_cny) }}</span>
              <span>累计充值 {{ money(deposit?.total_paid_cny) }}</span>
            </p>
          </div>
        </section>
      </aside>
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
.dev-home__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(300px, 0.9fr);
  gap: 16px;
  align-items: start;
}

.dev-home__main,
.dev-home__aside {
  display: grid;
  gap: 16px;
  align-content: start;
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

.dev-home__more .el-icon {
  transition: transform 0.2s ease;
}

.dev-home__more:hover .el-icon {
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
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--dev-line);
  border-radius: 12px;
  background: var(--dev-surface-strong);
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
  font-size: 13px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.dev-home__delivery-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
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

.dev-home__chart {
  position: relative;
  margin-top: 10px;
}

.dev-home__chart-svg {
  display: block;
  width: 100%;
  height: 104px;
}

.dev-home__chart-stop-a {
  stop-color: var(--dev-blue);
  stop-opacity: 0.24;
}

.dev-home__chart-stop-b {
  stop-color: var(--dev-blue);
  stop-opacity: 0;
}

.dev-home__chart-axis {
  stroke: var(--dev-line);
  stroke-width: 1;
  stroke-dasharray: 4 4;
}

.dev-home__chart-line {
  fill: none;
  stroke: var(--dev-blue);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.dev-home__chart-dot {
  fill: var(--dev-surface-strong);
  stroke: var(--dev-blue);
  stroke-width: 1.5;
}

.dev-home__chart-dot.is-peak {
  fill: var(--dev-blue);
}

.dev-home__chart-dot.is-active {
  fill: var(--dev-blue);
  stroke-width: 2.5;
}

/* 悬停读数：深底白字的胶囊，与「最高一天」那颗蓝胶囊区分开——蓝的是这一周的峰值，
   深色的是鼠标底下那一天的当日读数。横向位置与两端翻边由模板内联给（见 hoveredBucket）。 */
.dev-home__chart-tip {
  position: absolute;
  top: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--dev-ink);
  color: var(--dev-surface-strong);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

/* 从当天那个点到基线的竖线：指着哪一天，一眼能看出对应的是曲线上的哪个点 */
.dev-home__chart-guide {
  position: absolute;
  width: 1px;
  background: color-mix(in srgb, var(--dev-blue) 38%, transparent);
  pointer-events: none;
}

/* 命中带：铺满整个图（含下面的日期），指到哪一格就报哪一天；它盖在 SVG 之上，
   所以曲线上的圆点不各挂一次监听，焦点与悬停都集中在这七颗按钮上。 */
.dev-home__chart-hits {
  position: absolute;
  inset: 0;
}

.dev-home__chart-hit {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.dev-home__chart-hit:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: -2px;
  border-radius: 6px;
}

.dev-home__chart-peak {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--dev-blue);
  color: var(--dev-surface-strong);
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}

.dev-home__chart-axis-labels {
  display: flex;
  justify-content: space-between;
  gap: 4px;
  margin-top: 6px;
  color: var(--dev-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.dev-home__chart-empty {
  margin: 8px 0 0;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
}

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

/* 980：双栏并一栏；交付卡片三列降两列 */
@media (max-width: 980px) {
  .dev-home__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .dev-home__deliveries {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

</style>
