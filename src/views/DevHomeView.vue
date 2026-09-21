<script setup lang="ts">
import { ArrowRight, Money, Wallet, WarningFilled } from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'
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

/** 汇总条上的一格：与收益钱包的 dev-meta-strip 同一份结构与读数口径。 */
type DevHomeMetaItem = {
  label: string
  value: string
  /** 今日收入环比；后端没给值时不出这个标签 */
  tag: { text: string; type: 'success' | 'danger' } | null
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

/** 保证金进度条只表达「可用占比」，冻结与充值总额在下方用标签补齐，避免小字被压得看不清。 */
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

/** 汇总条的五格读数：金额在左，计数在后，最后一格补上交付版本总量。 */
const metaItems = computed<DevHomeMetaItem[]>(() => [
  { label: '今日入账', value: money(overview.value?.today_income_cny), tag: todayRateTag.value },
  { label: '累计收入', value: money(overview.value?.total_income_cny), tag: null },
  { label: '进行中接单', value: String(overview.value?.active_requirement_count ?? 0), tag: null },
  { label: '已接取需求', value: String(requirements.value.length), tag: null },
  { label: '累计交付', value: `${deliveryVersionCount.value} 个版本`, tag: null },
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

// 页面标题与「已接取/保证金可用」摘要都由工作台外壳与汇总条承载，这里不再重复渲染。
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
      <button class="dev-home__button dev-home__button--gold dev-home__alert-action" type="button"
        @click="rechargeDialog?.open()">
        立即充值
      </button>
    </section>

    <!-- 汇总条：与收益钱包同款，只承载口径数字，把版面留给下面的列表与资金卡 -->
    <div class="dev-meta-strip dev-home__strip">
      <template v-for="(item, index) in metaItems" :key="item.label">
        <div class="dev-meta-strip__item">
          <span class="dev-meta-strip__label">{{ item.label }}</span>
          <span class="dev-meta-strip__value">{{ item.value }}</span>
          <em v-if="item.tag" class="dev-home__strip-tag" :class="`dev-home__strip-tag--${item.tag.type}`">
            {{ item.tag.text }}
          </em>
        </div>
        <div v-if="index < metaItems.length - 1" class="dev-meta-strip__divider" aria-hidden="true" />
      </template>
    </div>

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
        <!-- 可提现余额：与收益钱包的主卡同一套视觉（金色大数 + 说明标签 + 底部操作条） -->
        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">可提现余额</h2>
          </header>

          <div class="dev-home__money">
            <p class="dev-home__money-main">
              <span class="dev-home__money-label">当前可提现</span>
              <strong class="dev-home__money-value">{{ money(overview?.withdrawable_balance_cny) }}</strong>
            </p>
            <p class="dev-home__money-tags">
              <span class="dev-chip dev-home__chip">待提现 {{ money(overview?.pending_withdraw_cny) }}</span>
              <span class="dev-chip dev-home__chip">累计收入 {{ money(overview?.total_income_cny) }}</span>
            </p>
            <div class="dev-home__money-footer">
              <RouterLink class="dev-home__button dev-home__button--primary" :to="{ name: 'dev-wallet' }">
                <el-icon>
                  <Wallet />
                </el-icon>
                <span>去提现</span>
              </RouterLink>
              <RouterLink class="dev-home__button dev-home__button--ghost" :to="{ name: 'dev-wallet-releases' }">
                <span>交付记录</span>
              </RouterLink>
            </div>
          </div>
        </section>

        <section class="dev-surface-card dev-home__panel">
          <header class="dev-home__panel-head">
            <h2 class="dev-section-title">接单保证金</h2>
          </header>

          <div class="dev-home__money">
            <p class="dev-home__money-main">
              <span class="dev-home__money-label">可用保证金</span>
              <strong class="dev-home__money-value">{{ money(deposit?.available_cny) }}</strong>
            </p>
            <!-- 进度条只表达可用占比，具体金额在下方两个标签里 -->
            <div class="dev-home__track" role="progressbar" aria-label="可用保证金占累计充值"
              :aria-valuenow="depositAvailablePercent" aria-valuemin="0" aria-valuemax="100">
              <span class="dev-home__fill" :style="{ width: `${depositAvailablePercent}%` }" />
            </div>
            <p class="dev-home__money-tags">
              <span class="dev-chip dev-home__chip">冻结 {{ money(deposit?.frozen_cny) }}</span>
              <span class="dev-chip dev-home__chip">累计充值 {{ money(deposit?.total_paid_cny) }}</span>
            </p>
            <div class="dev-home__money-footer">
              <button class="dev-home__button dev-home__button--primary" type="button"
                @click="rechargeDialog?.open()">
                <el-icon>
                  <Money />
                </el-icon>
                <span>立即充值</span>
              </button>
            </div>
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
/* 本页只用开发者体系令牌（--dev-*），骨架照收益钱包那一套来：
   汇总条读数 → 面板列表 → 金色大数的资金卡。见 doc/设计规范.md 第一节。 */

/* 收益钱包的页面节奏是 20px，dev-page 默认 24px，这里跟钱包对齐 */
.dev-home {
  gap: 20px;
}

/* 加载中压暗数据区，避免把「还没拿到数据」误读成真实的 0 */
.dev-home--loading .dev-home__strip,
.dev-home--loading .dev-home__panel {
  opacity: 0.6;
}

.dev-home__strip,
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

/* 今日收入环比：只在这里出现，用体系里的青（涨）与红（跌）两支色 */
.dev-home__strip-tag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.dev-home__strip-tag--success {
  background: rgba(42, 166, 164, 0.12);
  color: #1f7a78;
}

.dev-home__strip-tag--danger {
  background: rgba(190, 60, 60, 0.12);
  color: #9f3030;
}

/* 左栏是两条长列表，右栏是三张资金卡；窄屏并成一栏 */
.dev-home__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr);
  gap: 16px;
  align-items: start;
}

.dev-home__main,
.dev-home__aside {
  display: grid;
  gap: 16px;
  align-content: start;
}

.dev-home__panel {
  padding: 20px;
}

.dev-home__panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
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
  grid-template-columns: minmax(0, 1fr) auto;
}

.dev-home__income-row {
  grid-template-columns: minmax(0, 1fr) auto;
}

.dev-home__row:last-child,
.dev-home__income-row:last-child {
  padding-bottom: 0;
  border-bottom: 0;
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

/* 资金卡：金色大数 + 说明标签 + 底部分隔线，与收益钱包的主卡同一套读数口径 */
.dev-home__money {
  display: grid;
  gap: 12px;
}

.dev-home__money-main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 10px;
  margin: 0;
}

.dev-home__money-label {
  color: var(--dev-muted);
  font-size: 13px;
}

.dev-home__money-value {
  color: var(--dev-gold);
  font-size: 34px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.dev-home__money-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.dev-home__track {
  height: 6px;
  border-radius: 999px;
  background: rgba(17, 24, 39, 0.08);
  overflow: hidden;
}

.dev-home__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  /* 复用开发者侧的品牌渐变（滚动条同款蓝→青），不再引入新色值 */
  background: var(--dev-scrollbar-thumb);
  transition: width 0.3s ease;
}

.dev-home__money-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--dev-line);
}

/* 按钮：与收益钱包主卡同高同圆角；链接与 <button> 共用一套外观 */
.dev-home__button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.dev-home__button .el-icon {
  font-size: 16px;
}

.dev-home__button--primary {
  min-width: 132px;
  border-color: var(--dev-blue);
  background: var(--dev-blue);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(31, 74, 209, 0.18);
}

.dev-home__button--primary:hover,
.dev-home__button--primary:focus-visible {
  border-color: #173aaa;
  background: #173aaa;
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(31, 74, 209, 0.22);
  transform: translateY(-1px);
}

.dev-home__button--gold {
  border-color: var(--dev-gold);
  background: var(--dev-gold);
  color: #ffffff;
  box-shadow: 0 10px 22px rgba(185, 129, 43, 0.2);
}

.dev-home__button--gold:hover,
.dev-home__button--gold:focus-visible {
  border-color: #96661f;
  background: #96661f;
  box-shadow: 0 12px 24px rgba(185, 129, 43, 0.26);
  transform: translateY(-1px);
}

.dev-home__button--ghost {
  min-width: 88px;
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(255, 255, 255, 0.9);
  color: #475569;
  box-shadow: 0 8px 18px rgba(17, 24, 39, 0.04);
}

.dev-home__button--ghost:hover,
.dev-home__button--ghost:focus-visible {
  border-color: rgba(31, 74, 209, 0.24);
  background: rgba(31, 74, 209, 0.07);
  color: var(--dev-blue);
  box-shadow: 0 10px 20px rgba(31, 74, 209, 0.08);
  transform: translateY(-1px);
}

.dev-home__button:focus-visible {
  outline: 2px solid var(--dev-blue);
  outline-offset: 2px;
}

/* 980：双栏并一栏；汇总条由 dev-meta-strip 自己换行 */
@media (max-width: 980px) {
  .dev-home__layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  /* 触屏档：状态与金额换到标题下面一行，窄屏不再挤在一起 */
  .dev-home__row,
  .dev-home__income-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-height: 44px;
  }

  .dev-home__row-side {
    justify-content: space-between;
  }

  .dev-home__income-row .dev-home__row-amount {
    text-align: left;
  }

  .dev-home__panel {
    padding: 16px;
  }

  .dev-home__money-value {
    font-size: 28px;
  }

  /* 触屏下按钮与可点文字不小于 44px */
  .dev-home__more {
    min-height: 44px;
  }

  .dev-home__alert-action {
    flex: 1 1 100%;
  }
}
</style>
