<script setup lang="ts">
import { WarningFilled } from '@element-plus/icons-vue'
import { computed, onMounted, ref } from 'vue'

import DevDepositRechargeDialog from '@/components/DevDepositRechargeDialog.vue'
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
    <section class="portal-page__stats" :class="{ 'dev-home__stats--loading': loading }">
      <RouterLink v-for="card in statCards" :key="card.label" class="portal-page__stat-card dev-home__stat"
        :to="{ name: card.target }">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
        <small class="dev-home__stat-hint">{{ card.hint }}</small>
      </RouterLink>
    </section>

    <div v-if="depositInsufficient" class="dev-home__alert" role="alert">
      <span class="dev-home__alert-icon" aria-hidden="true">
        <el-icon>
          <WarningFilled />
        </el-icon>
      </span>
      <div class="dev-home__alert-copy">
        <strong>保证金不足，暂不可接单</strong>
        <p>当前可用保证金 {{ money(deposit?.available_cny) }}，补齐后才能绑定资源项目。</p>
      </div>
      <button class="dev-home__alert-action" type="button" @click="rechargeDialog?.open()">去收益钱包充值</button>
    </div>

    <section class="portal-page__content">
      <div class="dev-home__main">
        <section class="portal-page__panel">
          <div class="portal-page__section-header">
            <h2>已接取需求单</h2>
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
            <span>去需求大厅接单后会显示在这里。</span>
          </p>
        </section>

        <section class="portal-page__panel">
          <div class="portal-page__section-header">
            <h2>最近交付</h2>
            <RouterLink class="portal-page__link-btn" :to="{ name: 'dev-wallet-releases' }">查看全部</RouterLink>
          </div>

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
            <span>绑定资源项目并发布版本后会显示在这里。</span>
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
          <p v-else class="portal-page__empty">暂无收入记录</p>
        </section>
      </aside>
    </section>

    <!-- 保证金充值弹窗：与收益钱包页共用同一组件 -->
    <DevDepositRechargeDialog ref="rechargeDialog" />
  </main>
</template>

<style scoped>
/* 加载中把统计数字压暗，避免把「还没拿到数据」误读成真实的 0 */
.dev-home__stats--loading {
  opacity: 0.55;
}

/* 卡片标题与下方明细贴得太紧，间距对齐需求大厅的同款卡片 */
.dev-home .portal-page__aside-head {
  margin-bottom: 12px;
}

/* 保证金不足是阻断接单的状态，用警示色与同页 .wallet-payout__alert 保持一套配色 */
.dev-home__alert {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-left: 4px solid #f59e0b;
  border-radius: 18px;
  background: linear-gradient(135deg, #fffaf2, #fff4e2);
  box-shadow: 0 12px 26px rgba(180, 83, 9, 0.08);
}

.dev-home__alert-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.16);
  color: #d97706;
  font-size: 20px;
}

.dev-home__alert-copy {
  display: grid;
  flex: 1 1 240px;
  gap: 4px;
  min-width: 0;
}

.dev-home__alert-copy strong {
  color: #92400e;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.dev-home__alert-copy p {
  margin: 0;
  color: #b45309;
  font-size: 13px;
  line-height: 1.6;
}

.dev-home__alert-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  /* 按钮形态：清掉浏览器默认边框与字体，只保留渐变胶囊外观 */
  border: 0;
  font-family: inherit;
  cursor: pointer;
  padding: 0 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.dev-home__alert-action:hover {
  box-shadow: 0 10px 22px rgba(217, 119, 6, 0.28);
  transform: translateY(-1px);
}

.dev-home__alert-action:focus-visible {
  outline: 2px solid #b45309;
  outline-offset: 2px;
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

@media (max-width: 640px) {
  .dev-home__alert-action {
    flex: 1 1 100%;
  }
}
</style>
