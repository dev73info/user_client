<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Close, Connection, Plus, Refresh } from '@element-plus/icons-vue'

import PublishModal from '@/components/PublishModal.vue'
import { HttpError } from '@/api/http'
import { getMyRealnameVerification } from '@/api/realname'
import {
  createRequirement,
  getPublicRequirementOverview,
  getWorkbenchRequirementHallItem,
  listPublicRequirementSpotlights,
  type PublicRequirementSpotlightItem,
  type RequirementOverviewResp,
  type RequirementPaymentMode,
  type RequirementStatus,
} from '@/api/requirements'

import { useToast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/auth'
import {
  requirementRichTextPreview,
  sanitizeRequirementRichText,
  validateRequirementRichText,
} from '@/utils/requirementRichText'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { showToast } = useToast()

const loading = ref(false)
const overviewLoading = ref(false)
const requirements = ref<PublicRequirementSpotlightItem[]>([])
const overview = ref<RequirementOverviewResp | null>(null)
const keyword = ref('')
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const selectedRequirement = ref<PublicRequirementSpotlightItem | null>(null)
const selectedRequirementDetailLoading = ref(false)

const selectedRequirementDescriptionHtml = computed(
  () =>
    sanitizeRequirementRichText(selectedRequirement.value?.description ?? '') ||
    '当前需求暂未补充详细描述。',
)
const selectedRequirementAcceptanceHtml = computed(
  () =>
    sanitizeRequirementRichText(selectedRequirement.value?.acceptance_criteria ?? '') ||
    (selectedRequirementDetailLoading.value ? '验收标准加载中...' : '当前需求暂未补充验收标准。'),
)

const filteredRequirements = computed(() => {
  const normalized = keyword.value.trim().toLowerCase()
  if (!normalized) {
    return requirements.value
  }

  return requirements.value.filter((item) => {
    const searchable = [
      item.requirement_id,
      item.title,
      requirementRichTextPreview(item.description, ''),
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
  },
  {
    label: '已完成需求',
    value: `${overview.value?.total_orders ?? 0} 单`,
  },
  {
    label: '好评率',
    value: `${(overview.value?.positive_rate ?? 0).toFixed(1)}%`,
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

function resetKeyword() {
  keyword.value = ''
  if (route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
  }
}

function openAuthLogin() {
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: route.fullPath || '/requirement-hall',
    },
  })
}

async function ensurePublishRealnameApproved() {
  auth.hydrate()
  if (!auth.isAuthed) {
    showToast('发布需求前请先登录', 'info')
    openAuthLogin()
    return false
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    if (record.status === 'approved') {
      return true
    }

    if (record.status === 'pending') {
      showToast('实名认证审核中，通过后可发布需求', 'warning')
      return false
    }

    showToast('实名认证未通过，请重新提交后再发布需求', 'warning')
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: route.fullPath || '/requirement-hall' },
    })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      showToast('发布需求前请先完成实名认证', 'warning')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: route.fullPath || '/requirement-hall' },
      })
      return false
    }

    showToast(err instanceof Error ? err.message : '实名认证状态校验失败', 'error')
    return false
  }
}

function resetPublishForm() {
  publishTitle.value = ''
  publishDescription.value = ''
  publishBudget.value = ''
  publishAcceptance.value = ''
  publishPaymentMode.value = 'self_managed'
}

async function openPublishModal() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  resetPublishForm()
  publishVisible.value = true
}

function closePublishModal() {
  if (publishLoading.value) {
    return
  }

  publishVisible.value = false
  resetPublishForm()
}

function openRequirementDetail(item: PublicRequirementSpotlightItem) {
  selectedRequirement.value = item
  void loadRequirementDetailForModal(item)
}

function closeRequirementDetail() {
  selectedRequirementDetailLoading.value = false
  selectedRequirement.value = null
}

function openRequirementWorkbench(requirement: PublicRequirementSpotlightItem) {
  void router.push({
    name: 'dev-requirement-detail',
    params: { requirementId: requirement.requirement_id },
  })
}

async function loadRequirementDetailForModal(item: PublicRequirementSpotlightItem) {
  if (item.acceptance_criteria?.trim()) {
    return
  }

  auth.hydrate()
  if (!auth.token) {
    return
  }

  selectedRequirementDetailLoading.value = true
  try {
    const detail = await getWorkbenchRequirementHallItem(auth.token, item.requirement_id)
    if (selectedRequirement.value?.requirement_id !== item.requirement_id) {
      return
    }

    selectedRequirement.value = {
      ...selectedRequirement.value,
      title: detail.title,
      description: detail.description ?? selectedRequirement.value.description,
      acceptance_criteria:
        detail.acceptance_criteria ?? selectedRequirement.value.acceptance_criteria,
      budget: detail.budget ?? selectedRequirement.value.budget,
      payment_method: detail.payment_method ?? selectedRequirement.value.payment_method,
      payment_mode: detail.payment_mode,
      status: detail.status,
      updated_at: detail.updated_at,
    }
  } catch {
    // 公共详情仍可展示精选列表已有信息；完整详情补齐失败时保持当前内容。
  } finally {
    if (selectedRequirement.value?.requirement_id === item.requirement_id) {
      selectedRequirementDetailLoading.value = false
    }
  }
}

async function submitPublishRequirement() {
  const approved = await ensurePublishRealnameApproved()
  if (!approved) {
    return
  }

  const normalizedTitle = publishTitle.value.trim()
  const descriptionValidation = validateRequirementRichText(publishDescription.value, '需求描述', {
    minTextLength: 10,
  })
  const acceptanceValidation = validateRequirementRichText(publishAcceptance.value, '验收标准', {
    required: true,
  })
  const budgetRaw = String(publishBudget.value ?? '').trim()

  if (normalizedTitle.length < 4) {
    showToast('需求标题至少 4 个字符', 'error')
    return
  }

  if (descriptionValidation.error) {
    showToast(descriptionValidation.error, 'error')
    return
  }

  if (!budgetRaw) {
    showToast('预算不能为空', 'error')
    return
  }

  const budget = Number(budgetRaw)

  if (!Number.isFinite(budget) || budget < 0) {
    showToast('预算必须是大于等于0的数字', 'error')
    return
  }

  if (acceptanceValidation.error) {
    showToast(acceptanceValidation.error, 'error')
    return
  }

  publishLoading.value = true
  try {
    await createRequirement(auth.token, {
      title: normalizedTitle,
      description: descriptionValidation.value,
      budget,
      acceptance_criteria: acceptanceValidation.value,
      payment_mode: publishPaymentMode.value,
    })

    showToast('需求已发布，等待审核', 'success')
    publishVisible.value = false
    resetPublishForm()
    await loadHallData()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '发布失败', 'error')
  } finally {
    publishLoading.value = false
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
          </div>
          <div class="portal-page__header-actions requirement-hall__header-actions">
            <span v-if="overviewLoading" class="portal-page__loading-chip">同步中</span>
            <button class="requirement-hall__publish-btn" type="button" @click="openPublishModal">
              <el-icon>
                <Plus />
              </el-icon>
              <span>发布需求</span>
            </button>
            <button class="requirement-hall__refresh-btn" type="button" :disabled="loading || overviewLoading"
              @click="loadHallData">
              <el-icon>
                <Refresh />
              </el-icon>
              <span>刷新</span>
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
            class="portal-page__card requirement-hall__card" role="button" tabindex="0"
            @click="openRequirementDetail(card)" @keydown.enter="openRequirementDetail(card)"
            @keydown.space.prevent="openRequirementDetail(card)">
            <div class="portal-page__card-topline">
              <span class="portal-page__chip">{{ paymentTag(card) }}</span>
              <span class="portal-page__meta">{{ statusToLabel(card.status) }}</span>
            </div>
            <h2>{{ card.title }}</h2>
            <p>{{ requirementRichTextPreview(card.description, '当前需求暂未补充详细描述。') }}</p>
            <div class="requirement-hall__meta-row">
              <span>{{ card.requirement_id }}</span>
              <span>更新于 {{ formatTimeLabel(card.updated_at) }}</span>
            </div>
            <div class="portal-page__card-footer">
              <strong>{{ formatMoney(card.budget) }}</strong>
              <span>查看详情</span>
            </div>
          </article>
        </div>

        <div v-else class="portal-page__empty portal-page__empty--stacked">
          <strong>{{ keyword.trim() ? '没有匹配的需求' : '当前没有可展示的需求' }}</strong>
          <button v-if="keyword.trim()" class="portal-page__secondary" type="button" @click="resetKeyword">
            清空筛选
          </button>
        </div>
      </section>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card requirement-hall__overview-card">
          <div class="portal-page__aside-head">
            <h3>大厅概览</h3>
          </div>
          <ul class="portal-page__timeline requirement-hall__stats">
            <li v-for="item in hallStats" :key="item.label"
              class="portal-page__timeline-item requirement-hall__stat-item">
              <div class="requirement-hall__stat-main">
                <strong>{{ item.value }}</strong>
                <span>{{ item.label }}</span>
              </div>
            </li>
          </ul>
        </section>

        <section class="portal-page__aside-card requirement-hall__recent-card">
          <div class="portal-page__aside-head">
            <h3>最近交付</h3>
          </div>
          <ul v-if="recentDeals.length" class="portal-page__list requirement-hall__deal-list">
            <li v-for="deal in recentDeals" :key="deal.payment_id"
              class="portal-page__list-item requirement-hall__deal-item">
              <strong>{{ deal.title }}</strong>
              <span class="portal-page__meta">{{ formatMoney(deal.amount_cny) }} · {{ formatTimeLabel(deal.paid_at)
                }}</span>
              <p v-if="deal.comment_text">{{ deal.comment_text }}</p>
            </li>
          </ul>
          <p v-else class="portal-page__empty requirement-hall__empty-delivery">
            暂无最近交付记录。
          </p>
        </section>
      </aside>
    </section>
  </main>

  <PublishModal :visible="publishVisible" v-model:publishTitle="publishTitle"
    v-model:publishDescription="publishDescription" v-model:publishBudget="publishBudget"
    v-model:publishAcceptance="publishAcceptance" v-model:publishPaymentMode="publishPaymentMode"
    :allowPlatformGuarantee="false" :publishLoading="publishLoading" @close="closePublishModal" @notify="showToast"
    @submit="submitPublishRequirement" />

  <Teleport to="body">
    <div v-if="selectedRequirement" class="requirement-hall-detail-wrap" @click.self="closeRequirementDetail">
      <section class="requirement-hall-detail" :aria-label="`${selectedRequirement.title}详情`">
        <header class="requirement-hall-detail__head">
          <div>
            <span class="portal-page__chip">{{ paymentTag(selectedRequirement) }}</span>
            <h3>{{ selectedRequirement.title }}</h3>
            <p>
              {{ selectedRequirement.requirement_id }} ·
              {{ statusToLabel(selectedRequirement.status) }}
            </p>
          </div>
          <button class="requirement-hall-detail__close" type="button" aria-label="关闭详情"
            @click="closeRequirementDetail">
            <el-icon>
              <Close />
            </el-icon>
          </button>
        </header>

        <div class="requirement-hall-detail__meta">
          <span>编号：{{ selectedRequirement.requirement_id }}</span>
          <span>发布方式：{{ paymentTag(selectedRequirement) }}</span>
          <span>状态：{{ statusToLabel(selectedRequirement.status) }}</span>
          <span>更新：{{ formatTimeLabel(selectedRequirement.updated_at) }}</span>
          <span>创建：{{ formatTimeLabel(selectedRequirement.created_at) }}</span>
        </div>

        <section class="requirement-hall-detail__review-panel">
          <div class="requirement-hall-detail__review-item">
            <span class="requirement-hall-detail__review-label">需求标题</span>
            <div class="requirement-hall-detail__review-value">{{ selectedRequirement.title }}</div>
          </div>

          <div class="requirement-hall-detail__review-item">
            <span class="requirement-hall-detail__review-label">需求描述</span>
            <article
              class="requirement-hall-detail__review-value requirement-hall-detail__review-value--multiline requirement-hall-detail__rich"
              v-html="selectedRequirementDescriptionHtml"></article>
          </div>

          <div class="requirement-hall-detail__review-grid">
            <div class="requirement-hall-detail__review-item">
              <span class="requirement-hall-detail__review-label">预算</span>
              <div class="requirement-hall-detail__review-value">
                {{ formatMoney(selectedRequirement.budget) }}
              </div>
            </div>

            <div class="requirement-hall-detail__review-item">
              <span class="requirement-hall-detail__review-label">验收标准</span>
              <article
                class="requirement-hall-detail__review-value requirement-hall-detail__review-value--multiline requirement-hall-detail__rich"
                v-html="selectedRequirementAcceptanceHtml"></article>
            </div>
          </div>
        </section>

        <div class="requirement-hall-detail__actions">
          <button class="requirement-hall-detail__bind" type="button"
            @click="openRequirementWorkbench(selectedRequirement)">
            <el-icon>
              <Connection />
            </el-icon>
            <span>前往工作台接取需求</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.requirement-hall__header-actions {
  align-self: flex-start;
  gap: 8px;
  padding-top: 2px;
}

.requirement-hall__publish-btn,
.requirement-hall__refresh-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.requirement-hall__publish-btn {
  padding: 0 14px;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.18);
}

.requirement-hall__publish-btn:hover {
  background: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.requirement-hall__refresh-btn {
  padding: 0 12px;
  border-color: rgba(191, 219, 254, 0.96);
  background: rgba(239, 246, 255, 0.82);
  color: #2563eb;
}

.requirement-hall__refresh-btn:hover:not(:disabled) {
  border-color: rgba(37, 99, 235, 0.34);
  background: rgba(219, 234, 254, 0.92);
}

.requirement-hall__refresh-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
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
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.requirement-hall__card:hover {
  border-color: rgba(37, 99, 235, 0.32);
  transform: translateY(-1px);
  box-shadow: 0 16px 30px rgba(76, 103, 172, 0.14);
}

.requirement-hall__card:focus-visible {
  border-color: rgba(37, 99, 235, 0.52);
  outline: none;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

.requirement-hall__card p {
  min-height: 48px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.requirement-hall__card .portal-page__card-footer span {
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
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

.requirement-hall__overview-card,
.requirement-hall__recent-card {
  overflow: hidden;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.94));
}

.requirement-hall__overview-card .portal-page__aside-head,
.requirement-hall__recent-card .portal-page__aside-head {
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.82);
}

.requirement-hall__overview-card .portal-page__aside-head h3,
.requirement-hall__recent-card .portal-page__aside-head h3 {
  font-size: 20px;
  line-height: 1.3;
}

.requirement-hall__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.portal-page--nav .requirement-hall__stats .requirement-hall__stat-item {
  display: flex;
  min-height: 0;
  padding: 12px;
  border-radius: 14px;
  border-color: rgba(219, 234, 254, 0.9);
  background: rgba(248, 250, 252, 0.78);
  box-shadow: none;
  backdrop-filter: none;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
}

.requirement-hall__stat-main {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.requirement-hall__stat-main strong {
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: 0;
}

.requirement-hall__stat-main span {
  color: #475569;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.35;
}

.requirement-hall__deal-list {
  gap: 0;
}

.requirement-hall__deal-item {
  padding: 12px 0;
}

.requirement-hall__deal-item:first-child {
  padding-top: 0;
}

.requirement-hall__deal-item:last-child {
  padding-bottom: 0;
}

.requirement-hall__empty-delivery.portal-page__empty {
  margin: 0;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.78);
  color: #64748b;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.6;
}

.portal-page__secondary:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.requirement-hall-detail-wrap {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(5px);
}

.requirement-hall-detail {
  width: min(860px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  overflow-y: auto;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 28px 72px rgba(15, 23, 42, 0.22);
}

.requirement-hall-detail__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.84);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
}

.requirement-hall-detail__head h3 {
  margin: 10px 0 6px;
  color: #0f172a;
  font-size: 22px;
  line-height: 1.3;
}

.requirement-hall-detail__head p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.requirement-hall-detail__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: #fff;
  color: #334155;
  cursor: pointer;
}

.requirement-hall-detail__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding: 14px 22px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
  color: #475569;
  font-size: 13px;
  font-weight: 800;
}

.requirement-hall-detail__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 0 22px 22px;
  background: rgba(248, 250, 252, 0.62);
}

.requirement-hall-detail__bind {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 16px;
  border: 1px solid rgba(37, 99, 235, 0.34);
  border-radius: 8px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.requirement-hall-detail__bind:hover {
  border-color: rgba(29, 78, 216, 0.42);
  background: #1d4ed8;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
  transform: translateY(-1px);
}

.requirement-hall-detail__bind:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.16);
}

.requirement-hall-detail__review-panel {
  display: grid;
  gap: 12px;
  margin: 16px 22px;
  padding: 16px;
  border: 1px solid rgba(17, 24, 39, 0.08);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.96), rgba(241, 245, 249, 0.92));
}

.requirement-hall-detail__review-grid {
  display: grid;
  grid-template-columns: minmax(0, 160px) minmax(0, 1fr);
  gap: 12px;
}

.requirement-hall-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.requirement-hall-detail__review-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  line-height: 1.35;
}

.requirement-hall-detail__review-value {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  color: #0f172a;
  font-weight: 700;
  line-height: 1.7;
  box-shadow: inset 0 0 0 1px rgba(148, 163, 184, 0.12);
}

.requirement-hall-detail__review-value--multiline {
  white-space: pre-wrap;
}

.requirement-hall-detail__section {
  padding: 20px 22px 4px;
}

.requirement-hall-detail__section:last-child {
  padding-bottom: 22px;
}

.requirement-hall-detail__section h4 {
  margin: 0 0 12px;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.35;
}

.requirement-hall-detail__rich {
  color: #334155;
  font-weight: 500;
  line-height: 1.75;
  overflow-wrap: anywhere;
}

.requirement-hall-detail__rich :deep(*:not(a)) {
  color: inherit;
}

.requirement-hall-detail__rich :deep(strong),
.requirement-hall-detail__rich :deep(b) {
  color: #1e293b;
  font-weight: 700;
}

.requirement-hall-detail__rich :deep(p),
.requirement-hall-detail__rich :deep(ul),
.requirement-hall-detail__rich :deep(ol),
.requirement-hall-detail__rich :deep(blockquote) {
  margin: 0 0 12px;
}

.requirement-hall-detail__rich :deep(ul),
.requirement-hall-detail__rich :deep(ol) {
  padding-left: 22px;
}

.requirement-hall-detail__rich :deep(a) {
  color: #2563eb;
  font-weight: 600;
}

.requirement-hall-detail__rich :deep(pre) {
  overflow-x: auto;
  padding: 14px 16px;
  border-radius: 14px;
  background: #0f172a;
  color: #e2e8f0;
}

.requirement-hall-detail__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 12px 0;
  border-radius: 14px;
}

.requirement-hall-detail__rich :deep(.rich-editor-attachment) {
  display: inline-flex;
  max-width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 640px) {
  .portal-page--nav .requirement-hall__header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .requirement-hall__publish-btn {
    width: 100%;
  }

  .requirement-hall__filters {
    grid-template-columns: 1fr;
  }

  .requirement-hall-detail__actions {
    padding: 0 16px 18px;
  }

  .requirement-hall-detail__bind {
    width: 100%;
  }

  .requirement-hall-detail__review-panel {
    margin: 14px 16px;
    padding: 14px;
    border-radius: 16px;
  }

  .requirement-hall-detail__review-grid {
    grid-template-columns: 1fr;
  }

  .portal-page--nav .requirement-hall__overview-card,
  .portal-page--nav .requirement-hall__recent-card {
    padding: 14px 16px;
    border-radius: 16px;
  }

  .requirement-hall__overview-card .portal-page__aside-head,
  .requirement-hall__recent-card .portal-page__aside-head {
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .requirement-hall__overview-card .portal-page__aside-head h3,
  .requirement-hall__recent-card .portal-page__aside-head h3 {
    font-size: 18px;
  }

  .portal-page--nav .requirement-hall__stats .requirement-hall__stat-item {
    padding: 10px;
    border-radius: 12px;
  }

  .requirement-hall__stat-main strong {
    font-size: 19px;
  }

  .requirement-hall__stat-main span {
    font-size: 11px;
  }
}
</style>
