<script setup lang="ts">
import { ArrowRight, Clock, Files, Money, Wallet, WarningFilled } from '@element-plus/icons-vue'
import { computed, onMounted, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { getDevWalletOverview, type DevWalletIncomeItem, type DevWalletOverview } from '@/api/devWallet'
import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { useToast } from '@/composables/useToast'
import {
  DEMO_DEV_HOME_DEPOSIT,
  DEMO_DEV_HOME_REQUIREMENTS,
  DEMO_DEV_HOME_RESOURCES,
  DEMO_DEV_HOME_WALLET,
  devHomeMockEnabled,
} from '@/shared/devHomeMock'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

/** 页面只用开发者体系的三个强调色，灰色留给终止态，不引入第五种颜色。 */
type DevHomeTone = 'blue' | 'gold' | 'cyan' | 'muted'

type DevHomeStatCard = {
  label: string
  value: string
  hint: string
  /** 今日收入环比；后端没给值时不出这个标签 */
  tag: { text: string; type: 'success' | 'danger' } | null
  tone: DevHomeTone
  icon: Component
  target: string
}

const auth = useAuthStore()
const route = useRoute()
const { showToast } = useToast()

const loading = ref(false)
const overview = ref<DevWalletOverview | null>(null)
const deposit = ref<DevOrderDepositStatus | null>(null)
const requirements = ref<RequirementItem[]>([])
const resources = ref<McResourcePayload[]>([])

/** 演示数据开关：开着时整页不读接口，只用于本地预览布局。 */
const mockEnabled = devHomeMockEnabled(route.query.mock === '1')

// 总览页只做汇总：列表最多展示 5 条，完整明细留在「我的接单」与「交付记录」页。
const OVERVIEW_LIST_LIMIT = 5

const recentRequirements = computed(() =>
  [...requirements.value]
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, OVERVIEW_LIST_LIMIT),
)

const resourceTitleMap = computed(() => new Map(resources.value.map((item) => [item.id, item.title])))

/** 交付 = 绑定资源项目的资源版本，所以交付记录按「已绑定资源的需求单」汇总。 */
const deliveryRows = computed(() =>
  [...requirements.value]
    .filter((item) => item.bound_resource_id != null)
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
    .slice(0, OVERVIEW_LIST_LIMIT)
    .flatMap((item) => {
      const resourceId = item.bound_resource_id
      if (resourceId == null) {
        return []
      }
      return [{
        requirementId: item.requirement_id,
        requirementTitle: item.title,
        resourceTitle: resourceTitleMap.value.get(resourceId) ?? `资源 #${resourceId}`,
        versionCount: item.bound_resource_version_count ?? 0,
      }]
    }),
)

const deliveryVersionCount = computed(() =>
  requirements.value.reduce((total, item) => total + (item.bound_resource_version_count ?? 0), 0),
)

const recentIncome = computed<DevWalletIncomeItem[]>(() => overview.value?.recent_income ?? [])

/** 未缴保证金或可用余额不足时后端会关掉绑定开关，两种情况共用同一条提示。 */
const depositInsufficient = computed(() => (deposit.value ? !deposit.value.can_bind_requirement : false))

/** 保证金进度条只表达「可用占比」，冻结与充值总额在下方用文字补齐，避免小字被压得看不清。 */
const depositAvailablePercent = computed(() => {
  const total = deposit.value?.total_paid_cny ?? 0
  if (total <= 0) {
    return 0
  }

  const available = deposit.value?.available_cny ?? 0
  return Math.min(100, Math.max(0, Math.round((available / total) * 100)))
})

/** 今日收入环比：涨绿跌红，后端没给值时不出这个标签。 */
const todayRateTag = computed(() => {
  const rate = overview.value?.today_income_change_rate
  if (rate == null) {
    return null
  }

  return { text: rateText(rate), type: rate >= 0 ? ('success' as const) : ('danger' as const) }
})

const statCards = computed<DevHomeStatCard[]>(() => [
  {
    label: '接单收入',
    value: money(overview.value?.total_income_cny),
    hint: `今日 ${money(overview.value?.today_income_cny)}`,
    tag: todayRateTag.value,
    tone: 'blue',
    icon: Wallet,
    target: 'dev-wallet',
  },
  {
    label: '可提现余额',
    value: money(overview.value?.withdrawable_balance_cny),
    hint: `待提现 ${money(overview.value?.pending_withdraw_cny)}`,
    tag: null,
    tone: 'gold',
    icon: Money,
    target: 'dev-wallet',
  },
  {
    label: '进行中接单',
    value: String(overview.value?.active_requirement_count ?? 0),
    hint: `已完成 ${overview.value?.total_completed_orders ?? 0} 单`,
    tag: null,
    tone: 'cyan',
    icon: Clock,
    target: 'dev-my-requirements',
  },
  {
    label: '已接取需求',
    value: String(requirements.value.length),
    hint: `累计交付 ${deliveryVersionCount.value} 个版本`,
    tag: null,
    tone: 'blue',
    icon: Files,
    target: 'dev-wallet-releases',
  },
])

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

/** 状态标签沿用统一口径：浅底 + 深字，底色交给 .dev-chip 系列与本地 muted 变体。 */
const CHIP_TONES: Record<DevHomeTone, string> = {
  blue: '',
  gold: 'dev-chip--warm',
  cyan: 'dev-chip--cyan',
  muted: 'dev-home__chip--muted',
}

function statusTone(status: string): DevHomeTone {
  return STATUS_TONES[status] ?? 'blue'
}

function statusChipClass(status: string) {
  return CHIP_TONES[statusTone(status)]
}

function rateText(value: number | null) {
  if (value == null) {
    return '0.0%'
  }

  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

/** 保证金不足时直接在总览页充值，不走跳转：与收益钱包页共用同一个充值弹窗 */
const rechargeDialog = ref<InstanceType<typeof DevDepositRechargeDialog> | null>(null)

// 页面标题与「已接取/保证金可用」摘要都由工作台外壳与统计卡承载，这里不再重复渲染。
onMounted(() => {
  void loadPage()
})

function money(value?: number | null) {
  if (value == null) {
    return '¥0.00'
  }

  return `¥${value.toFixed(2)}`
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

    <section v-if="depositInsufficient" class="dev-home__alert" role="alert">
      <span class="dev-home__alert-icon" aria-hidden="true">
        <el-icon>
          <WarningFilled />
        </el-icon>
      </span>
      <div class="dev-home__alert-copy">
        <strong>保证金不足，暂不可接单</strong>
        <p>当前可用保证金 {{ money(deposit?.available_cny) }}，补齐后才能绑定资源项目。</p>
      </div>
      <button class="dev-home__alert-action" type="button" @click="rechargeDialog?.open()">立即充值</button>
    </section>

    <!-- 四格指标：每格一种色调，右上角「今日环比」只在后端给了数据时出现 -->
    <section class="dev-home__stats">
      <RouterLink v-for="card in statCards" :key="card.label" class="dev-home__stat"
        :class="`dev-home__stat--${card.tone}`" :to="{ name: card.target }">
        <span class="dev-home__stat-icon" aria-hidden="true">
          <el-icon>
            <component :is="card.icon" />
          </el-icon>
        </span>
        <span class="dev-home__stat-label">{{ card.label }}</span>
        <strong class="dev-home__stat-value">{{ card.value }}</strong>
        <span class="dev-home__stat-hint">
          <span>{{ card.hint }}</span>
          <em v-if="card.tag" class="dev-home__stat-tag" :class="`dev-home__stat-tag--${card.tag.type}`">
            {{ card.tag.text }}
          </em>
        </span>
      </RouterLink>
    </section>

    <section class="dev-home__layout">
      <div class="dev-home__main">
        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">已接取需求单</h2>
            <span v-if="recentRequirements.length" class="dev-home__panel-count">{{ recentRequirements.length }}</span>
            <RouterLink class="dev-home__more" :to="{ name: 'dev-my-requirements' }">
              <span>查看全部</span>
              <el-icon>
                <ArrowRight />
              </el-icon>
            </RouterLink>
          </header>

          <ul v-if="recentRequirements.length" class="dev-home__list">
            <li v-for="item in recentRequirements" :key="item.requirement_id" class="dev-home__row">
              <span class="dev-home__dot" :class="`dev-home__dot--${statusTone(item.status)}`" aria-hidden="true" />
              <div class="dev-home__row-main">
                <strong class="dev-home__row-title">{{ item.title }}</strong>
                <span class="dev-home__row-meta">{{ item.requirement_id }} · 更新于
                  {{ formatCnDateTime(item.updated_at) }}</span>
              </div>
              <div class="dev-home__row-side">
                <span class="dev-chip dev-home__chip" :class="statusChipClass(item.status)">
                  {{ requirementStatusLabel(item.status) }}
                </span>
                <strong class="dev-home__row-amount">{{ money(item.budget) }}</strong>
              </div>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>暂无已接取需求</strong>
          </p>
        </section>

        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">最近交付</h2>
            <span v-if="deliveryRows.length" class="dev-home__panel-count">{{ deliveryRows.length }}</span>
            <RouterLink class="dev-home__more" :to="{ name: 'dev-wallet-releases' }">
              <span>查看全部</span>
              <el-icon>
                <ArrowRight />
              </el-icon>
            </RouterLink>
          </header>

          <ul v-if="deliveryRows.length" class="dev-home__list">
            <li v-for="row in deliveryRows" :key="row.requirementId" class="dev-home__row">
              <span class="dev-home__dot dev-home__dot--cyan" aria-hidden="true" />
              <div class="dev-home__row-main">
                <strong class="dev-home__row-title">{{ row.resourceTitle }}</strong>
                <span class="dev-home__row-meta">{{ row.requirementId }} · {{ row.requirementTitle }}</span>
              </div>
              <div class="dev-home__row-side">
                <span class="dev-chip dev-chip--cyan dev-home__chip">{{ row.versionCount }} 个版本</span>
              </div>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>暂无交付记录</strong>
          </p>
        </section>
      </div>

      <aside class="dev-home__aside">
        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">接单保证金</h2>
            <RouterLink class="dev-home__more" :to="{ name: 'dev-wallet' }">
              <span>去充值</span>
              <el-icon>
                <ArrowRight />
              </el-icon>
            </RouterLink>
          </header>

          <div class="dev-home__deposit">
            <p class="dev-home__deposit-top">
              <span class="dev-home__deposit-label">可用</span>
              <strong class="dev-home__deposit-value">{{ money(deposit?.available_cny) }}</strong>
            </p>
            <!-- 进度条只表达可用占比，具体金额在下方两格里 -->
            <div class="dev-home__deposit-track" role="progressbar" aria-label="可用保证金占累计充值"
              :aria-valuenow="depositAvailablePercent" aria-valuemin="0" aria-valuemax="100">
              <span class="dev-home__deposit-fill" :style="{ width: `${depositAvailablePercent}%` }" />
            </div>
            <dl class="dev-home__deposit-meta">
              <div>
                <dt>冻结</dt>
                <dd>{{ money(deposit?.frozen_cny) }}</dd>
              </div>
              <div>
                <dt>累计充值</dt>
                <dd>{{ money(deposit?.total_paid_cny) }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">最近收入</h2>
            <span v-if="recentIncome.length" class="dev-home__panel-count">{{ recentIncome.length }}</span>
            <RouterLink class="dev-home__more" :to="{ name: 'dev-wallet-releases' }">
              <span>查看全部</span>
              <el-icon>
                <ArrowRight />
              </el-icon>
            </RouterLink>
          </header>

          <ul v-if="recentIncome.length" class="dev-home__list">
            <li v-for="item in recentIncome" :key="item.payment_id" class="dev-home__income-row">
              <div class="dev-home__row-main">
                <strong class="dev-home__row-title">{{ item.title }}</strong>
                <span class="dev-home__row-meta">{{ item.customer }} · {{ formatCnDateTime(item.paid_at) }}</span>
              </div>
              <strong class="dev-home__row-amount">{{ money(item.amount_cny) }}</strong>
            </li>
          </ul>
          <p v-else class="dev-empty-state dev-home__empty">
            <strong>暂无收入记录</strong>
          </p>
        </section>
      </aside>
    </section>

    <!-- 保证金充值弹窗：与收益钱包页共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />
  </div>
</template>

<style scoped>
/* 本页只用开发者体系令牌（--dev-*）：暖白面 + 蓝/青/金三色强调，见 doc/设计规范.md 第一节。 */

/* 加载中压暗数据区，避免把「还没拿到数据」误读成真实的 0 */
.dev-home--loading .dev-home__stats,
.dev-home--loading .dev-home__panel {
  opacity: 0.6;
}

.dev-home__stats,
.dev-home__panel {
  transition: opacity 0.2s ease;
}

/* 演示数据提示条：它是本地预览用的说明，比保证金警示条更轻，用虚线中性框 */
.dev-home__mock-hint {
  margin: 0;
  padding: 10px 16px;
  border: 1px dashed rgba(17, 24, 39, 0.16);
  border-radius: 12px;
  background: rgba(255, 251, 244, 0.72);
  color: var(--dev-muted);
  font-size: 13px;
  line-height: 1.6;
}

.dev-home__mock-hint code {
  padding: 1px 6px;
  border-radius: 8px;
  background: rgba(31, 74, 209, 0.1);
  color: var(--dev-blue);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

/* 保证金不足会直接阻断接单，用开发者体系的金色（与 .dev-chip--warm 同一支色） */
.dev-home__alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(185, 129, 43, 0.28);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 250, 242, 0.96), rgba(255, 243, 224, 0.9));
  box-shadow: var(--dev-shadow);
}

.dev-home__alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(185, 129, 43, 0.14);
  color: var(--dev-gold);
  font-size: 18px;
}

.dev-home__alert-copy {
  display: grid;
  flex: 1 1 240px;
  gap: 4px;
  min-width: 0;
}

.dev-home__alert-copy strong {
  color: var(--dev-ink);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.dev-home__alert-copy p {
  margin: 0;
  color: var(--dev-muted);
  font-size: 13px;
  line-height: 1.6;
}

.dev-home__alert-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  /* 按钮形态：清掉浏览器默认边框与字体，只保留渐变胶囊外观 */
  border: 0;
  font-family: inherit;
  cursor: pointer;
  padding: 0 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--dev-gold), #96661f);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.dev-home__alert-action:hover {
  box-shadow: 0 10px 22px rgba(185, 129, 43, 0.26);
  transform: translateY(-1px);
}

.dev-home__alert-action:focus-visible {
  outline: 2px solid var(--dev-gold);
  outline-offset: 2px;
}

/* 四格指标：左侧图标 + 右侧「标签 / 金额」，明细占满一行 */
.dev-home__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.dev-home__stat {
  position: relative;
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 4px 10px;
  overflow: hidden;
  padding: 16px 18px;
  border: 1px solid var(--dev-line);
  border-radius: 18px;
  background: var(--dev-surface);
  box-shadow: 0 12px 26px rgba(76, 103, 172, 0.08);
  color: inherit;
  text-decoration: none;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

/* 左上角一抹色调晕染：四张卡各自认色，但整体仍是暖白面（--home-wash / --home-tone 由修饰类给出） */
.dev-home__stat::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120% 96% at 0% 0%, var(--home-wash, rgba(31, 74, 209, 0.12)), transparent 62%);
  pointer-events: none;
}

.dev-home__stat:hover {
  box-shadow: 0 18px 34px rgba(76, 103, 172, 0.16);
  transform: translateY(-2px);
}

.dev-home__stat:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
}

.dev-home__stat--blue {
  --home-wash: rgba(31, 74, 209, 0.12);
  --home-tone: var(--dev-blue);
}

.dev-home__stat--gold {
  --home-wash: rgba(185, 129, 43, 0.14);
  --home-tone: var(--dev-gold);
}

.dev-home__stat--cyan {
  --home-wash: rgba(42, 166, 164, 0.14);
  --home-tone: var(--dev-cyan);
}

.dev-home__stat--muted {
  --home-wash: rgba(107, 114, 128, 0.12);
  --home-tone: var(--dev-muted);
}

.dev-home__stat-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  grid-column: 1;
  grid-row: 1 / span 2;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  /* 图标底与左上角晕染同色，四张卡一眼能分开 */
  background: var(--home-wash, rgba(31, 74, 209, 0.12));
  border: 1px solid rgba(17, 24, 39, 0.06);
  color: var(--home-tone, var(--dev-blue));
  font-size: 17px;
}

.dev-home__stat-label {
  grid-column: 2;
  grid-row: 1;
  color: var(--dev-muted);
  font-size: 13px;
}

.dev-home__stat-value {
  grid-column: 2;
  grid-row: 2;
  color: var(--dev-ink);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dev-home__stat-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  grid-column: 1 / -1;
  grid-row: 3;
  gap: 6px;
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.45;
}

.dev-home__stat-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dev-home__stat-tag--success {
  background: rgba(42, 166, 164, 0.12);
  color: #1f7a78;
}

.dev-home__stat-tag--danger {
  background: rgba(190, 60, 60, 0.12);
  color: #9f3030;
}

/* 左栏列表 + 右栏卡片：右栏在壳层 sticky 头部下方跟着滚 */
.dev-home__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr);
  gap: 14px;
  align-items: start;
}

.dev-home__main,
.dev-home__aside {
  display: grid;
  gap: 14px;
  align-content: start;
}

.dev-home__aside {
  position: sticky;
  /* 偏移要躲开工作台外壳那条 sticky 标题栏（98px + 自身 56px 高 + 12px 间距） */
  top: calc(var(--portal-header-footprint, 98px) + 68px);
}

.dev-home__panel {
  padding: 18px;
}

.dev-home__panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.dev-home__panel-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(31, 74, 209, 0.1);
  color: var(--dev-blue);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dev-home__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
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

/* 列表行不做整行点击（点击目标是右侧「查看全部」），所以只用细分隔线，不给悬浮态 */
.dev-home__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dev-home__row,
.dev-home__income-row {
  display: grid;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--dev-line);
}

.dev-home__row {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.dev-home__income-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.dev-home__row:last-child,
.dev-home__income-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

/* 状态点：颜色即状态，配一圈同色光晕，比占位的色条更容易聚焦到标题 */
.dev-home__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--dev-blue);
  box-shadow: 0 0 0 4px rgba(31, 74, 209, 0.12);
}

.dev-home__dot--gold {
  background: var(--dev-gold);
  box-shadow: 0 0 0 4px rgba(185, 129, 43, 0.14);
}

.dev-home__dot--cyan {
  background: var(--dev-cyan);
  box-shadow: 0 0 0 4px rgba(42, 166, 164, 0.14);
}

.dev-home__dot--muted {
  background: var(--dev-muted);
  box-shadow: 0 0 0 4px rgba(107, 114, 128, 0.12);
}

.dev-home__row-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dev-home__row-title {
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
}

.dev-home__row-meta {
  color: var(--dev-muted);
  font-size: 12px;
  line-height: 1.6;
  font-variant-numeric: tabular-nums;
}

.dev-home__row-side {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

/* 行内标签比 .dev-chip 默认形态矮一档，避免把行撑高 */
.dev-home__chip {
  padding: 4px 10px;
}

.dev-home__chip--muted {
  border-color: var(--dev-line);
  background: rgba(255, 255, 255, 0.7);
  color: var(--dev-muted);
}

/* 金额用金色：与钱包页、需求大厅对金额的取色保持一致 */
.dev-home__row-amount {
  min-width: 88px;
  color: var(--dev-gold);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.dev-home__income-row .dev-home__row-amount {
  min-width: 0;
}

.dev-home__deposit {
  display: grid;
  gap: 12px;
}

.dev-home__deposit-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
}

.dev-home__deposit-label {
  color: var(--dev-muted);
  font-size: 13px;
}

.dev-home__deposit-value {
  color: var(--dev-ink);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dev-home__deposit-track {
  height: 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.08);
  overflow: hidden;
}

.dev-home__deposit-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  /* 复用开发者侧的品牌渐变（滚动条同款蓝→青），不再引入新色值 */
  background: var(--dev-scrollbar-thumb);
  transition: width 0.3s ease;
}

.dev-home__deposit-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.dev-home__deposit-meta > div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--dev-line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.62);
}

.dev-home__deposit-meta dt {
  color: var(--dev-muted);
  font-size: 12px;
}

.dev-home__deposit-meta dd {
  margin: 0;
  color: var(--dev-ink);
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 980：双栏并一栏，右栏不再吸附；指标由四格降到两格 */
@media (max-width: 980px) {
  .dev-home__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dev-home__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .dev-home__aside {
    position: static;
  }
}

@media (max-width: 640px) {
  .dev-home__stats {
    grid-template-columns: minmax(0, 1fr);
  }

  /* 触屏档：状态与金额换到标题下面一行，窄屏不再三列挤在一起 */
  .dev-home__row {
    grid-template-columns: auto minmax(0, 1fr);
    min-height: 44px;
  }

  .dev-home__row-side {
    grid-column: 2;
    /* 触屏档：状态靠左、金额靠右，金额列不与标签挤在一起 */
    justify-content: space-between;
  }

  .dev-home__income-row {
    grid-template-columns: minmax(0, 1fr);
    min-height: 44px;
  }

  .dev-home__income-row .dev-home__row-amount {
    text-align: left;
  }

  .dev-home__panel {
    padding: 16px;
  }

  .dev-home__deposit-value {
    font-size: 22px;
  }

  /* 触屏下按钮与可点文字不小于 44px */
  .dev-home__more,
  .dev-home__stat,
  .dev-home__alert-action {
    min-height: 44px;
  }

  .dev-home__alert-action {
    flex: 1 1 100%;
  }
}
</style>
