<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import {
  getPublicRequirementOverview,
  listPublicRequirementSpotlights,
  type PublicRequirementSpotlightItem,
  type RequirementOverviewResp,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'

import { useToast } from '@/composables/useToast'

const router = useRouter()
const route = useRoute()
const { showToast } = useToast()

const loading = ref(false)
const overviewLoading = ref(false)
const requirements = ref<PublicRequirementSpotlightItem[]>([])
const overview = ref<RequirementOverviewResp | null>(null)
const keyword = ref('')
const selectedRequirement = ref<PublicRequirementSpotlightItem | null>(null)

const filteredRequirements = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  if (!normalized) {
    return requirements.value
  }

  return requirements.value.filter((item) => {
    const searchable = [
      item.requirement_id,
      item.title,
      item.description ?? '',
      item.payment_method ?? '',
      paymentModeLabel(item.payment_mode),
      statusToLabel(item.status),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(normalized)
  })
})

const hallStats = computed(() => [
  {
    label: '可浏览需求',
    value: `${requirements.value.length} 条`,
    hint: keyword.value.trim()
      ? `当前筛选 ${filteredRequirements.value.length} 条`
      : '来自已付定金需求',
  },
  {
    label: '已完成需求',
    value: `${overview.value?.total_orders ?? 0} 单`,
    hint: `较昨日 ${formatTrend(overview.value?.total_orders_change_rate ?? 0)}`,
  },
  {
    label: '好评率',
    value: `${(overview.value?.positive_rate ?? 0).toFixed(1)}%`,
    hint: `较昨日 ${formatTrend(overview.value?.positive_rate_change_rate ?? 0)}`,
  },
])

const recentDeals = computed(() => overview.value?.recent_deals.slice(0, 3) ?? [])

watch(
  () => route.query.keyword,
  (value) => {
    keyword.value = typeof value === 'string' ? value.trim() : ''
  },
  { immediate: true },
)

watch(
  filteredRequirements,
  (items) => {
    if (items.length === 0) {
      selectedRequirement.value = null
      return
    }

    const currentId = selectedRequirement.value?.requirement_id
    if (!currentId || !items.some((item) => item.requirement_id === currentId)) {
      const firstItem = items[0]
      if (firstItem) {
        selectedRequirement.value = firstItem
      }
    }
  },
  { immediate: true },
)

onMounted(() => {
  void loadHallData()
})

function statusToLabel(status: RequirementStatus): string {
  const mapping: Record<RequirementStatus, string> = {
    pending_review: '待审核',
    rejected: '已拒绝',
    pending_deposit: '待付定金',
    deposit_paid: '待开发',
    in_development: '开发中',
    pending_final: '待付尾款',
    final_paid: '已付尾款',
    completed: '已完成',
  }

  return mapping[status]
}

function paymentModeLabel(mode: RequirementPaymentMode): string {
  return mode === 'self_managed' ? '无平台担保' : '平台担保'
}

function paymentTag(item: PublicRequirementSpotlightItem): string {
  return item.payment_method?.trim() || paymentModeLabel(item.payment_mode)
}

function formatMoney(value?: number | null): string {
  if (value == null) {
    return '待议价'
  }

  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
}

function formatTimeLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTrend(rate: number): string {
  if (rate > 0) {
    return `上升 ${rate.toFixed(1)}%`
  }
  if (rate < 0) {
    return `下降 ${Math.abs(rate).toFixed(1)}%`
  }
  return '持平'
}

function selectRequirement(item: PublicRequirementSpotlightItem) {
  selectedRequirement.value = item
}

function resetKeyword() {
  keyword.value = ''
  if (route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
  }
}

async function loadHallData() {
  loading.value = true
  overviewLoading.value = true
  const [requirementsResult, overviewResult] = await Promise.allSettled([
    listPublicRequirementSpotlights(),
    getPublicRequirementOverview(),
  ])

  if (requirementsResult.status === 'fulfilled') {
    requirements.value = requirementsResult.value
  } else {
    requirements.value = []
    showToast('加载需求大厅失败', 'warning')
  }

  if (overviewResult.status === 'fulfilled') {
    overview.value = overviewResult.value
  } else {
    overview.value = null
    showToast('加载大厅概览失败', 'warning')
  }

  loading.value = false
  overviewLoading.value = false
}
</script>

<template>
  <main class="portal-page portal-page--nav">
    <section class="portal-page__content">
      <section class="portal-page__panel" v-loading="loading">
        <div class="portal-page__section-header">
          <div>
            <p class="portal-page__eyebrow">热门需求</p>
            <h2>当前大厅重点展示的合作机会</h2>
            <p class="requirement-hall__subtitle">
              展示已进入待开发阶段的真实需求，按最近更新优先排序。
            </p>
          </div>
          <div class="portal-page__header-actions">
            <span v-if="overviewLoading" class="portal-page__loading-chip">同步中</span>
            <button class="portal-page__link-btn" type="button" @click="loadHallData">刷新</button>
            <button class="portal-page__link-btn" type="button" @click="router.push({ name: 'home' })">
              返回门户
            </button>
          </div>
        </div>

        <div class="requirement-hall__filters">
          <input v-model="keyword" type="search" placeholder="搜索需求标题、编号、交付方式..." />
          <button class="portal-page__secondary" type="button" :disabled="!keyword.trim()" @click="resetKeyword">
            清空
          </button>
        </div>

        <div v-if="loading" class="portal-page__card-grid requirement-hall__grid">
          <article v-for="item in 4" :key="item" class="portal-page__card portal-page__resource-skeleton">
            <span class="portal-page__skeleton-chip"></span>
            <span class="portal-page__skeleton-title"></span>
            <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
            <span class="portal-page__skeleton-line"></span>
            <span class="portal-page__skeleton-action"></span>
          </article>
        </div>

        <div v-else-if="filteredRequirements.length" class="portal-page__card-grid requirement-hall__grid">
          <article v-for="card in filteredRequirements" :key="card.requirement_id"
            class="portal-page__card requirement-hall__card"
            :class="{ active: selectedRequirement?.requirement_id === card.requirement_id }">
            <div class="portal-page__card-topline">
              <span class="portal-page__chip">{{ paymentTag(card) }}</span>
              <span class="portal-page__meta">{{ statusToLabel(card.status) }}</span>
            </div>
            <h2>{{ card.title }}</h2>
            <p>{{ card.description || '当前需求暂未补充详细描述。' }}</p>
            <div class="requirement-hall__meta-row">
              <span>{{ card.requirement_id }}</span>
              <span>更新于 {{ formatTimeLabel(card.updated_at) }}</span>
            </div>
            <div class="portal-page__card-footer">
              <strong>{{ formatMoney(card.budget) }}</strong>
              <button class="portal-page__action" type="button" @click="selectRequirement(card)">
                查看详情
              </button>
            </div>
          </article>
        </div>

        <div v-else class="portal-page__empty portal-page__empty--stacked">
          <strong>{{ keyword.trim() ? '没有匹配的需求' : '当前没有可展示的需求' }}</strong>
          <span>{{
            keyword.trim()
              ? '换一个关键词试试，或清空筛选查看全部公开需求。'
              : '有新的待开发需求后会自动出现在这里。'
          }}</span>
          <button v-if="keyword.trim()" class="portal-page__secondary" type="button" @click="resetKeyword">
            清空筛选
          </button>
        </div>
      </section>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>大厅概览</h3>
          </div>
          <ul class="portal-page__timeline requirement-hall__stats">
            <li v-for="item in hallStats" :key="item.label" class="portal-page__timeline-item">
              <div>
                <strong>{{ item.value }}</strong>
                <p>{{ item.label }} · {{ item.hint }}</p>
              </div>
            </li>
          </ul>
        </section>

        <section v-if="selectedRequirement" class="portal-page__aside-card requirement-hall__detail-card">
          <div class="portal-page__aside-head">
            <h3>需求详情</h3>
            <span class="portal-page__meta">{{ statusToLabel(selectedRequirement.status) }}</span>
          </div>
          <strong>{{ selectedRequirement.title }}</strong>
          <p>{{ selectedRequirement.description || '当前需求暂未补充详细描述。' }}</p>
          <dl class="requirement-hall__detail-list">
            <div>
              <dt>需求编号</dt>
              <dd>{{ selectedRequirement.requirement_id }}</dd>
            </div>
            <div>
              <dt>预算</dt>
              <dd>{{ formatMoney(selectedRequirement.budget) }}</dd>
            </div>
            <div>
              <dt>交付方式</dt>
              <dd>{{ paymentTag(selectedRequirement) }}</dd>
            </div>
            <div>
              <dt>更新时间</dt>
              <dd>{{ formatTimeLabel(selectedRequirement.updated_at) }}</dd>
            </div>
          </dl>
        </section>

        <section class="portal-page__aside-card">
          <div class="portal-page__aside-head">
            <h3>最近交付</h3>
          </div>
          <ul v-if="recentDeals.length" class="portal-page__list">
            <li v-for="deal in recentDeals" :key="deal.payment_id" class="portal-page__list-item">
              <strong>{{ deal.title }}</strong>
              <span class="portal-page__meta">{{ formatMoney(deal.amount_cny) }} · {{ formatTimeLabel(deal.paid_at)
                }}</span>
              <p v-if="deal.comment_text">{{ deal.comment_text }}</p>
            </li>
          </ul>
          <p v-else class="portal-page__empty">暂无最近交付记录。</p>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.requirement-hall__subtitle {
  margin: 6px 0 0;
}

.requirement-hall__filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 14px;
}

.requirement-hall__filters input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(198, 210, 236, 0.86);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.92);
  color: #0f172a;
  padding: 0 14px;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.requirement-hall__filters input:focus {
  border-color: rgba(37, 99, 235, 0.58);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.requirement-hall__grid {
  align-items: stretch;
}

.requirement-hall__card {
  min-height: 188px;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.requirement-hall__card:hover,
.requirement-hall__card.active {
  border-color: rgba(37, 99, 235, 0.32);
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.14);
}

.requirement-hall__card p {
  min-height: 48px;
}

.requirement-hall__meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.requirement-hall__stats .portal-page__timeline-item strong {
  font-size: 20px;
}

.requirement-hall__detail-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.requirement-hall__detail-card>strong {
  color: #0f172a;
  font-size: 16px;
}

.requirement-hall__detail-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.requirement-hall__detail-list div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
}

.requirement-hall__detail-list dt,
.requirement-hall__detail-list dd {
  margin: 0;
  line-height: 1.6;
}

.requirement-hall__detail-list dt {
  color: #64748b;
}

.requirement-hall__detail-list dd {
  color: #0f172a;
  font-weight: 700;
  word-break: break-word;
}

.portal-page__secondary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .requirement-hall__filters {
    grid-template-columns: 1fr;
  }
}
</style>
