<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { getDevOrderDepositStatus, type DevOrderDepositStatus } from '@/api/devOrderDeposit'
import { getDevWalletOverview, type DevWalletIncomeItem, type DevWalletOverview } from '@/api/devWallet'
import { listMcResources, type McResourcePayload } from '@/api/mcResources'
import { listMyRequirements, type RequirementItem } from '@/api/devRequirements'
import { useToast } from '@/composables/useToast'
import { formatCnDateTime } from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const overview = ref<DevWalletOverview | null>(null)
const deposit = ref<DevOrderDepositStatus | null>(null)
const requirements = ref<RequirementItem[]>([])
const resources = ref<McResourcePayload[]>([])

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

const statCards = computed(() => [
  {
    label: '接单收入',
    value: money(overview.value?.total_income_cny),
    hint: `今日 ${money(overview.value?.today_income_cny)}`,
    target: 'dev-wallet',
  },
  {
    label: '可提现余额',
    value: money(overview.value?.withdrawable_balance_cny),
    hint: `待提现 ${money(overview.value?.pending_withdraw_cny)}`,
    target: 'dev-wallet',
  },
  {
    label: '进行中接单',
    value: String(overview.value?.active_requirement_count ?? 0),
    hint: `已完成 ${overview.value?.total_completed_orders ?? 0} 单`,
    target: 'dev-my-requirements',
  },
  {
    label: '已接取需求',
    value: String(requirements.value.length),
    hint: `累计交付 ${deliveryVersionCount.value} 个版本`,
    target: 'dev-wallet-releases',
  },
])

const heroSummary = computed(() => {
  const received = `已接取 ${requirements.value.length} 单`
  return deposit.value ? `${received} · 保证金可用 ${money(deposit.value.available_cny)}` : received
})

const quickLinks = [
  { label: '需求大厅', name: 'dev-requirement-hall' },
  { label: '我的资源项目', name: 'dev-resource-list' },
  { label: '收益钱包', name: 'dev-wallet' },
  { label: '交付记录', name: 'dev-wallet-releases' },
] as const

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
  <main class="portal-page dev-home">
    <section class="portal-page__panel dev-home__hero">
      <div class="dev-home__hero-copy">
        <p class="portal-page__eyebrow">开发者工作台</p>
        <h2>{{ auth.username || '开发者' }} 的接单概览</h2>
        <p class="portal-page__meta">{{ heroSummary }}</p>
      </div>
      <div class="dev-home__hero-actions">
        <span v-if="loading" class="portal-page__loading-chip">同步中</span>
        <RouterLink class="portal-page__secondary dev-home__action" :to="{ name: 'dev-wallet' }">收益钱包</RouterLink>
        <button class="portal-page__secondary dev-home__action" type="button" :disabled="loading" @click="loadPage">
          {{ loading ? '刷新中' : '刷新' }}
        </button>
      </div>
    </section>

    <p v-if="depositInsufficient" class="portal-page__empty dev-home__alert" role="alert">
      <strong>保证金不足，暂不可接单</strong>
      <span>当前可用保证金 {{ money(deposit?.available_cny) }}，补齐后才能绑定资源项目。</span>
      <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-wallet' }">去收益钱包充值</RouterLink>
    </p>

    <section class="portal-page__stats">
      <RouterLink v-for="card in statCards" :key="card.label" class="portal-page__stat-card dev-home__stat"
        :to="{ name: card.target }">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small class="dev-home__stat-hint">{{ card.hint }}</small>
      </RouterLink>
    </section>

    <section class="portal-page__content">
      <div class="dev-home__main">
        <section class="portal-page__panel">
          <div class="portal-page__section-header">
            <div>
              <p class="portal-page__eyebrow">需求大厅</p>
              <h2>已接取需求单</h2>
            </div>
            <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-my-requirements' }">查看全部</RouterLink>
          </div>

          <ul v-if="recentRequirements.length" class="portal-page__list dev-home__rows">
            <li v-for="item in recentRequirements" :key="item.requirement_id" class="portal-page__list-item dev-home__row">
              <div class="dev-home__row-main">
                <strong>{{ item.title }}</strong>
                <span class="portal-page__meta">{{ item.requirement_id }} · 更新于
                  {{ formatCnDateTime(item.updated_at) }}</span>
              </div>
              <span class="portal-page__chip">{{ requirementStatusLabel(item.status) }}</span>
              <strong>{{ money(item.budget) }}</strong>
            </li>
          </ul>
          <p v-else class="portal-page__empty portal-page__empty--stacked">
            <strong>暂无已接取需求</strong>
            <span>去需求大厅关联资源项目后，接单进度会在这里汇总。</span>
          </p>
        </section>

        <section class="portal-page__panel">
          <div class="portal-page__section-header">
            <div>
              <p class="portal-page__eyebrow">交付记录</p>
              <h2>最近交付</h2>
            </div>
            <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-wallet-releases' }">查看全部</RouterLink>
          </div>
          <p class="portal-page__meta dev-home__section-note">
            交付即绑定资源项目的资源版本，累计 {{ deliveryVersionCount }} 个版本。
          </p>

          <ul v-if="deliveryRows.length" class="portal-page__list dev-home__rows">
            <li v-for="row in deliveryRows" :key="row.requirementId" class="portal-page__list-item dev-home__row">
              <div class="dev-home__row-main">
                <strong>{{ row.resourceTitle }}</strong>
                <span class="portal-page__meta">{{ row.requirementId }} · {{ row.requirementTitle }}</span>
              </div>
              <span class="portal-page__chip">{{ row.versionCount }} 个版本</span>
            </li>
          </ul>
          <p v-else class="portal-page__empty portal-page__empty--stacked">
            <strong>暂无交付记录</strong>
            <span>绑定资源项目并发布资源版本后，交付会显示在这里。</span>
          </p>
        </section>
      </div>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>接单保证金</h3>
            <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-wallet' }">去充值</RouterLink>
          </div>
          <ul class="portal-page__timeline">
            <li class="portal-page__timeline-item">
              <span>可用</span>
              <strong>{{ money(deposit?.available_cny) }}</strong>
            </li>
            <li class="portal-page__timeline-item">
              <span>冻结</span>
              <strong>{{ money(deposit?.frozen_cny) }}</strong>
            </li>
            <li class="portal-page__timeline-item">
              <span>累计已缴</span>
              <strong>{{ money(deposit?.total_paid_cny) }}</strong>
            </li>
          </ul>
        </section>

        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>最近收入</h3>
            <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-wallet-releases' }">查看全部</RouterLink>
          </div>
          <ul v-if="recentIncome.length" class="portal-page__list">
            <li v-for="item in recentIncome" :key="item.payment_id" class="portal-page__list-item">
              <strong>{{ item.title }}</strong>
              <span class="portal-page__meta">{{ item.customer }} · {{ formatCnDateTime(item.paid_at) }}</span>
              <span>{{ money(item.amount_cny) }}</span>
            </li>
          </ul>
          <p v-else class="portal-page__empty">暂无收入记录，需求结单后尾款会显示在这里。</p>
        </section>

        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>快捷入口</h3>
          </div>
          <ul class="portal-page__list">
            <li v-for="link in quickLinks" :key="link.name" class="portal-page__list-item dev-home__link-item">
              <RouterLink class="portal-page__link-btn" :to="{ name: link.name }">{{ link.label }}</RouterLink>
            </li>
          </ul>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.dev-home__hero {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.dev-home__hero-copy h2 {
  margin: 0;
}

.dev-home__hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

/* 复用 portal-page 的按钮外观，链接形态下补上对齐与触摸高度 */
.dev-home__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  text-decoration: none;
}

.dev-home__alert {
  display: grid;
  gap: 6px;
}

.dev-home__stat {
  display: grid;
  gap: 6px;
  color: inherit;
  text-decoration: none;
}

.dev-home__stat-hint {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.dev-home__main {
  display: grid;
  gap: 18px;
  align-content: start;
}

.dev-home__section-note {
  margin: 0 0 12px;
}

.dev-home__row {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dev-home__row-main {
  min-width: 0;
}

.dev-home__link-item {
  justify-content: center;
  min-height: 44px;
}

@media (max-width: 640px) {
  .dev-home__hero-actions {
    width: 100%;
  }

  .dev-home__action {
    flex: 1 1 140px;
  }
}
</style>
