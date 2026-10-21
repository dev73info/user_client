<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublishModal from '@/components/PublishModal.vue'
import PaymentModeChip from '@/components/PaymentModeChip.vue'
import ShareCardGenerator from '@/components/ShareCardGenerator.vue'
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
import { useAuthStore } from '@/stores/auth'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  formatCnDateTime as formatTimeLabel,
  formatCny as formatMoney,
  requirementPaymentModeLabel as paymentModeLabel,
} from '@/shared/requirementDisplay'
import {
  requirementRichTextPreview,
  sanitizeRequirementRichText,
  validateRequirementRichText,
} from '@/utils/requirementRichText'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'
import {
  TButton,
  TIcon,
  TMessage,
  TPagination,
  TSelect,
  Close,
  Connection,
  Plus,
  Refresh,
  type SelectModelValue,
} from 'ui_73info'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
function notify(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
  TMessage[type](message)
}

const loading = ref(false)
const overviewLoading = ref(false)
const requirements = ref<PublicRequirementSpotlightItem[]>([])
// 需求大厅分页：后端公开接口单页上限 100 条，默认 20 条一页。
const HALL_PAGE_SIZE = 20
const hallPage = ref(1)
const hallTotal = ref(0)
const overview = ref<RequirementOverviewResp | null>(null)
const keyword = ref('')
/**
 * 需求大厅「担保方式」筛选。
 *
 * `all` = 不筛；其余两个取值直接透传给后端 `payment_mode` 参数：
 * `platform_guarantee`（电签担保）/ `self_managed`（无电签约定）。
 * 语义以后端 `requirement.payment_mode` 为准，前端不做本地假筛。
 */
type GuaranteeFilter = 'all' | RequirementPaymentMode
const guaranteeFilter = ref<GuaranteeFilter>('all')

/**
 * 大厅是否已经成功拉过一次数据。
 * 用来把「首次进页面」和「后续刷新」分开：前者没有内容可留，出骨架屏；
 * 后者保留当前列表做就地刷新，不做整块清空重画。
 */
const hallLoadedOnce = ref(false)

/** 首次加载：还没有任何内容可展示，出骨架屏占位。 */
const showHallSkeleton = computed(() => loading.value && !hallLoadedOnce.value)

/** 就地刷新：已有内容，保留列表并整体压暗，等新数据回来再替换。 */
const hallRefreshing = computed(() => loading.value && hallLoadedOnce.value)

/**
 * 担保方式下拉的选项：`全部` + 两档担保方式。
 * 分档文案走 `paymentModeLabel`，与卡片上的标签同一口径，不另写一套。
 */
const guaranteeOptions = computed(() => [
  { label: '全部', value: 'all' as GuaranteeFilter },
  { label: paymentModeLabel('platform_guarantee'), value: 'platform_guarantee' as GuaranteeFilter },
  { label: paymentModeLabel('self_managed'), value: 'self_managed' as GuaranteeFilter },
])
const publishVisible = ref(false)
const publishTitle = ref('')
const publishDescription = ref('')
const publishBudget = ref<string | number>('')
const publishAcceptance = ref('')
const publishPaymentMode = ref<RequirementPaymentMode>('self_managed')
const publishLoading = ref(false)
const publishModalRef = ref<InstanceType<typeof PublishModal> | null>(null)
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

const isSelectedRequirementOwnedByCurrentUser = computed(() => {
  if (!auth.isAuthed || !selectedRequirement.value?.creator) {
    return false
  }

  return selectedRequirement.value.creator === auth.username
})

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
      paymentModeLabel(item.payment_mode),
      statusToLabel(item.status, item.payment_mode),
    ]
      .join(' ')
      .toLowerCase()

    return searchable.includes(normalized)
  })
})

const hallStats = computed(() => [
  {
    label: '可浏览需求',
    value: `${hallTotal.value} 条`,
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

/** 空态文案跟着当前生效的筛选走：关键词优先，其次担保方式，最后才是「大厅本来就没单」。 */
const hallEmptyTitle = computed(() => {
  if (keyword.value.trim()) {
    return '没有匹配的需求'
  }
  if (guaranteeFilter.value === 'platform_guarantee') {
    return `当前没有${paymentModeLabel('platform_guarantee')}的需求`
  }
  if (guaranteeFilter.value === 'self_managed') {
    return `当前没有${paymentModeLabel('self_managed')}的需求`
  }
  return '当前没有可展示的需求'
})

const recentDeals = computed(() => overview.value?.recent_deals.slice(0, 3) ?? [])

/** 最近交付只读星级：满星 / 半星 / 空星，与评价弹窗同一套 0.5 步口径。 */
function dealStarClass(rating: number | null | undefined, index: number) {
  if (rating == null || !Number.isFinite(rating)) {
    return ''
  }
  if (rating >= index) {
    return 'is-full'
  }
  if (rating >= index - 0.5) {
    return 'is-half'
  }
  return ''
}

/**
 * 侧栏评论预览：去掉「只填了数字」的脏数据（会和星级分数叠成「4.5 1」），
 * 太短也没信息量，宁可不展示。
 */
function dealCommentPreview(text: string | null | undefined) {
  const trimmed = text?.trim() ?? ''
  if (!trimmed || /^\d+(\.\d+)?$/.test(trimmed) || trimmed.length < 2) {
    return ''
  }
  return trimmed
}

watch(
  () => route.query.keyword,
  (value) => {
    keyword.value = typeof value === 'string' ? value.trim() : ''
  },
  { immediate: true },
)

watch(
  () => [route.query.requirement_id, route.query.view] as const,
  () => {
    openRouteRequirementDetail()
  },
)

watch(
  () => route.query.modal,
  (value) => {
    if (value === 'publish' && !publishVisible.value) {
      resetPublishForm()
      publishVisible.value = true
    }
  },
  { immediate: true },
)

onMounted(() => {
  setSeoMeta({
    title: '需求大厅 - 73Info 柒叁信息',
    description:
      '73Info 需求大厅展示公开合作机会，支持发布需求、查看预算与交付方式、对接开发者并沉淀沟通记录。',
    path: '/requirement-hall',
  })
  void loadHallData()
})

onBeforeUnmount(() => {
  resetSeoMeta()
})

/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
function statusToLabel(status: RequirementStatus, paymentMode?: RequirementPaymentMode): string {
  return requirementStatusLabel(status, paymentMode)
}

function paymentTag(item: PublicRequirementSpotlightItem): string {
  return paymentModeLabel(item.payment_mode)
}

function resetKeyword() {
  keyword.value = ''
  if (route.query.keyword) {
    const nextQuery = { ...route.query }
    delete nextQuery.keyword
    void router.replace({ query: nextQuery })
  }
}

/** 当前生效的担保方式；`all` 时返回 `undefined`，即请求里不带 `payment_mode`。 */
function activeGuaranteeMode(): RequirementPaymentMode | undefined {
  return guaranteeFilter.value === 'all' ? undefined : guaranteeFilter.value
}

/**
 * 切换担保方式筛选：这是服务端筛选，换值等于换结果集，
 * 所以回到第一页重新拉取，避免停留在上一个结果集的页码上。
 */
function onGuaranteeFilterChange(value: SelectModelValue) {
  const next: GuaranteeFilter =
    value === 'platform_guarantee' || value === 'self_managed' ? value : 'all'
  if (guaranteeFilter.value === next) {
    return
  }
  guaranteeFilter.value = next
  void loadHallData(1)
}

/** 空态里的「清空筛选」：关键词是本地过滤、担保方式是服务端筛选，分别复位。 */
function resetHallFilters() {
  const hadKeyword = Boolean(keyword.value.trim())
  if (hadKeyword) {
    resetKeyword()
  }
  if (guaranteeFilter.value !== 'all') {
    guaranteeFilter.value = 'all'
    void loadHallData(1)
  }
}

function routeRequirementId(): string {
  const rawValue = route.query.requirement_id ?? route.query.view
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue
  return typeof value === 'string' ? value.trim() : ''
}

function publishRedirectTarget() {
  return router.resolve({
    name: 'requirement-hall',
    query: { ...route.query, modal: 'publish' },
  }).fullPath
}

function openAuthLogin() {
  void router.push({
    name: 'home',
    query: {
      modal: 'auth',
      mode: 'login',
      redirect_to: publishRedirectTarget(),
    },
  })
}

async function ensurePublishRealnameApproved() {
  const redirectTarget = publishRedirectTarget()
  auth.hydrate()
  if (!auth.isAuthed) {
    TMessage.info('发布需求前请先登录')
    openAuthLogin()
    return false
  }

  try {
    const record = await getMyRealnameVerification(auth.token)
    if (record.status === 'approved') {
      return true
    }

    if (record.status === 'pending') {
      TMessage.warning('实名认证审核中，通过后可发布需求')
      return false
    }

    TMessage.warning('实名认证未通过，请重新提交后再发布需求')
    void router.push({
      name: 'workbench-realname',
      query: { redirect_to: redirectTarget },
    })
    return false
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      TMessage.warning('发布需求前请先完成实名认证')
      void router.push({
        name: 'workbench-realname',
        query: { redirect_to: redirectTarget },
      })
      return false
    }

    TMessage.error(err instanceof Error ? err.message : '实名认证状态校验失败')
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

function clearPublishModalQuery() {
  if (route.query.modal !== 'publish') {
    return
  }

  const nextQuery = { ...route.query }
  delete nextQuery.modal
  void router.replace({ query: nextQuery })
}

function closePublishModal() {
  if (publishLoading.value) {
    return
  }

  publishVisible.value = false
  resetPublishForm()
  clearPublishModalQuery()
}

function openRequirementDetail(item: PublicRequirementSpotlightItem) {
  selectedRequirement.value = item
  void loadRequirementDetailForModal(item)
}

function openRouteRequirementDetail() {
  const requirementId = routeRequirementId()
  if (!requirementId || loading.value) {
    return
  }

  if (selectedRequirement.value?.requirement_id === requirementId) {
    return
  }

  const target = requirements.value.find((item) => item.requirement_id === requirementId)
  if (target) {
    openRequirementDetail(target)
  }
}

function closeRequirementDetail() {
  selectedRequirementDetailLoading.value = false
  selectedRequirement.value = null

  if (routeRequirementId()) {
    const nextQuery = { ...route.query }
    delete nextQuery.requirement_id
    delete nextQuery.view
    void router.replace({ query: nextQuery })
  }
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
    TMessage.error('需求标题至少 4 个字符')
    return
  }

  if (descriptionValidation.error) {
    TMessage.error(descriptionValidation.error)
    return
  }

  if (!budgetRaw) {
    TMessage.error('预算不能为空')
    return
  }

  const budget = Number(budgetRaw)

  if (!Number.isFinite(budget) || budget < 0) {
    TMessage.error('预算必须是大于等于0的数字')
    return
  }

  if (acceptanceValidation.error) {
    TMessage.error(acceptanceValidation.error)
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

    TMessage.success('需求已发布，等待审核')
    publishVisible.value = false
    resetPublishForm()
    clearPublishModalQuery()
    publishModalRef.value?.clearDraft()
    await loadHallData()
  } catch (err) {
    TMessage.error(describeBackendError(err, '发布失败'))
  } finally {
    publishLoading.value = false
  }
}

async function loadHallData(page = hallPage.value) {
  loading.value = true
  overviewLoading.value = true
  const [requirementsResult, overviewResult] = await Promise.allSettled([
    listPublicRequirementSpotlights(page, HALL_PAGE_SIZE, activeGuaranteeMode()),
    getPublicRequirementOverview(),
  ])

  if (requirementsResult.status === 'fulfilled') {
    requirements.value = requirementsResult.value.items
    hallTotal.value = requirementsResult.value.total
    hallPage.value = requirementsResult.value.page
  } else {
    requirements.value = []
    hallTotal.value = 0
    TMessage.warning('加载需求大厅失败')
  }

  if (overviewResult.status === 'fulfilled') {
    overview.value = overviewResult.value
  } else {
    overview.value = null
    TMessage.warning('加载大厅概览失败')
  }

  loading.value = false
  overviewLoading.value = false
  // 无论这轮成功还是失败，都算「拉过一次」：失败时列表已被清空并给出空态，
  // 下一次刷新该保留空态做就地刷新，不再回退成骨架屏。
  hallLoadedOnce.value = true
  openRouteRequirementDetail()
}
</script>

<template>
  <main class="portal-page portal-page--nav">
    <section class="portal-page__content">
      <!-- 面板不再整块遮罩：首次加载由骨架屏顶上，后续刷新只压暗结果区就地替换。
           `aria-busy` 保留原有的无障碍语义。 -->
      <section
        class="portal-page__panel"
        :class="{ 'requirement-hall__panel--refreshing': hallRefreshing }"
        :aria-busy="loading ? 'true' : undefined"
      >
        <div class="requirement-hall__toolbar">
          <TSelect
            class="requirement-hall__guarantee-select"
            :model-value="guaranteeFilter"
            :options="guaranteeOptions"
            aria-label="按担保方式筛选需求"
            @update:model-value="onGuaranteeFilterChange"
          />

          <div class="requirement-hall__search">
            <input
              v-model="keyword"
              type="search"
              placeholder="搜索标题、编号"
              title="可按需求标题、编号、说明、担保方式与状态搜索"
            />
            <button
              v-if="keyword.trim()"
              class="requirement-hall__search-clear"
              type="button"
              aria-label="清空搜索"
              @click="resetKeyword"
            >
              <TIcon>
                <Close />
              </TIcon>
            </button>
          </div>

          <div class="portal-page__header-actions requirement-hall__header-actions">
            <button class="requirement-hall__publish-btn" type="button" @click="openPublishModal">
              <TIcon>
                <Plus />
              </TIcon>
              <span>发布需求</span>
            </button>
            <TButton
              icon-only
              :loading="loading || overviewLoading"
              aria-label="刷新"
              title="刷新"
              @click="loadHallData()"
            >
              <TIcon>
                <Refresh />
              </TIcon>
            </TButton>
          </div>
        </div>

        <!-- 骨架屏只在「第一次进页面、还没有任何内容」时出场。
             之后刷新（含切页、切筛选）都保留当前列表，避免整个容器被清空重画。 -->
        <div v-if="showHallSkeleton" class="portal-page__card-grid requirement-hall__grid">
          <article
            v-for="item in 4"
            :key="item"
            class="portal-page__card portal-page__resource-skeleton"
          >
            <span class="portal-page__skeleton-chip"></span>
            <span class="portal-page__skeleton-title"></span>
            <span class="portal-page__skeleton-line portal-page__skeleton-line--wide"></span>
            <span class="portal-page__skeleton-line"></span>
            <span class="portal-page__skeleton-action"></span>
          </article>
        </div>

        <div
          v-else-if="filteredRequirements.length"
          class="portal-page__card-grid requirement-hall__grid"
        >
          <article
            v-for="card in filteredRequirements"
            :key="card.requirement_id"
            class="portal-page__card requirement-hall__card"
            role="button"
            tabindex="0"
            @click="openRequirementDetail(card)"
            @keydown.enter="openRequirementDetail(card)"
            @keydown.space.prevent="openRequirementDetail(card)"
          >
            <div class="portal-page__card-topline">
              <PaymentModeChip :mode="card.payment_mode">{{
                statusToLabel(card.status, card.payment_mode)
              }}</PaymentModeChip>
            </div>
            <h2>{{ card.title }}</h2>
            <p>{{ requirementRichTextPreview(card.description, '当前需求暂未补充详细描述。') }}</p>
            <div class="requirement-hall__meta-row">
              <span>{{ card.requirement_id }}</span>
              <span>更新于 {{ formatTimeLabel(card.updated_at) }}</span>
            </div>
            <div class="portal-page__card-footer">
              <strong>{{ formatMoney(card.budget) }}</strong>
              <div class="requirement-hall__card-actions">
                <span>查看详情</span>
                <ShareCardGenerator
                  v-if="auth.isAuthed"
                  share-type="requirement"
                  :target-id="card.requirement_id"
                  label="分享"
                />
              </div>
            </div>
          </article>
        </div>

        <div v-else class="portal-page__empty portal-page__empty--stacked">
          <strong>{{ hallEmptyTitle }}</strong>
          <button
            v-if="keyword.trim() || guaranteeFilter !== 'all'"
            class="portal-page__secondary"
            type="button"
            @click="resetHallFilters"
          >
            清空筛选
          </button>
        </div>

        <TPagination
          v-if="filteredRequirements.length"
          class="requirement-hall__pager"
          :current-page="hallPage"
          :page-size="HALL_PAGE_SIZE"
          :total="hallTotal"
          @current-change="loadHallData"
        />
      </section>

      <aside class="portal-page__aside">
        <section class="portal-page__aside-card requirement-hall__overview-card">
          <div class="portal-page__aside-head">
            <h3>大厅概览</h3>
          </div>
          <ul class="portal-page__timeline requirement-hall__stats">
            <li
              v-for="item in hallStats"
              :key="item.label"
              class="portal-page__timeline-item requirement-hall__stat-item"
            >
              <div class="requirement-hall__stat-main">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </li>
          </ul>
        </section>

        <section class="portal-page__aside-card requirement-hall__recent-card">
          <div class="portal-page__aside-head">
            <h3>最近交付</h3>
          </div>
          <ul v-if="recentDeals.length" class="portal-page__list requirement-hall__deal-list">
            <li
              v-for="deal in recentDeals"
              :key="deal.payment_id"
              class="portal-page__list-item requirement-hall__deal-item"
            >
              <strong class="requirement-hall__deal-title">{{ deal.title }}</strong>
              <div class="requirement-hall__deal-foot">
                <span class="requirement-hall__deal-meta"
                  >{{ formatMoney(deal.amount_cny) }} · {{ formatTimeLabel(deal.paid_at) }}</span
                >
                <div
                  v-if="deal.comment_rating != null"
                  class="requirement-hall__deal-rating"
                  :aria-label="`客户评分 ${Number(deal.comment_rating).toFixed(1)} 分`"
                >
                  <span class="requirement-hall__deal-stars" aria-hidden="true">
                    <span
                      v-for="star in 5"
                      :key="star"
                      class="requirement-hall__deal-star"
                      :class="dealStarClass(deal.comment_rating, star)"
                      >★</span
                    >
                  </span>
                  <strong>{{ Number(deal.comment_rating).toFixed(1) }}</strong>
                  <span class="requirement-hall__deal-rating-unit">分</span>
                </div>
                <span v-else class="requirement-hall__deal-rating requirement-hall__deal-rating--empty"
                  >暂无评分</span
                >
              </div>
              <p
                v-if="dealCommentPreview(deal.comment_text)"
                class="requirement-hall__deal-comment"
              >
                {{ dealCommentPreview(deal.comment_text) }}
              </p>
            </li>
          </ul>
          <p v-else class="portal-page__empty requirement-hall__empty-delivery">
            暂无最近交付记录。
          </p>
        </section>
      </aside>
    </section>
  </main>

  <PublishModal
    ref="publishModalRef"
    :visible="publishVisible"
    v-model:publishTitle="publishTitle"
    v-model:publishDescription="publishDescription"
    v-model:publishBudget="publishBudget"
    v-model:publishAcceptance="publishAcceptance"
    v-model:publishPaymentMode="publishPaymentMode"
    :publishLoading="publishLoading"
    :draft-scope="auth.isAuthed ? auth.username : 'default'"
    @close="closePublishModal"
    @notify="notify"
    @submit="submitPublishRequirement"
  />

  <Teleport to="body">
    <div
      v-if="selectedRequirement"
      class="requirement-hall-detail-wrap"
      @click.self="closeRequirementDetail"
    >
      <section class="requirement-hall-detail" :aria-label="`${selectedRequirement.title}详情`">
        <header class="requirement-hall-detail__head">
          <div>
            <PaymentModeChip :mode="selectedRequirement.payment_mode" />
            <h3>{{ selectedRequirement.title }}</h3>
            <p>
              {{ selectedRequirement.requirement_id }} ·
              {{ statusToLabel(selectedRequirement.status, selectedRequirement.payment_mode) }}
            </p>
          </div>
          <button
            class="requirement-hall-detail__close"
            type="button"
            aria-label="关闭详情"
            @click="closeRequirementDetail"
          >
            <TIcon>
              <Close />
            </TIcon>
          </button>
        </header>

        <div class="requirement-hall-detail__meta">
          <span>编号：{{ selectedRequirement.requirement_id }}</span>
          <span>发布方式：{{ paymentTag(selectedRequirement) }}</span>
          <span>状态：{{ statusToLabel(selectedRequirement.status, selectedRequirement.payment_mode) }}</span>
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
              v-html="selectedRequirementDescriptionHtml"
            ></article>
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
                v-html="selectedRequirementAcceptanceHtml"
              ></article>
            </div>
          </div>
        </section>

        <div
          v-if="auth.isAuthed && !isSelectedRequirementOwnedByCurrentUser"
          class="requirement-hall-detail__actions"
        >
          <button
            class="requirement-hall-detail__bind"
            type="button"
            @click="openRequirementWorkbench(selectedRequirement)"
          >
            <TIcon>
              <Connection />
            </TIcon>
            <span>前往工作台接取需求</span>
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.requirement-hall__header-actions {
  flex: 0 0 auto;
  align-self: center;
  gap: 8px;
}

/* 发布需求：主按钮。刷新按钮改用库里的 TButton（icon-only，见模板），
   不再走这里的一套自定义底色 / 描边。 */
.requirement-hall__publish-btn {
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

/* 刷新按钮的样式由库里的 TButton（icon-only，outline / neutral / md）承担，
   与工作台概览条上的「刷新」同一个实现，这里不再自定义。 */

/* 就地刷新：不动布局、不清空容器，只把结果区整体压暗一点，新数据回来自然复原。
   过渡写在常态上，所以「压暗」与「复原」两个方向都是渐变的，不会闪一下。
   分页器是子组件，根节点有没有本文件的 scope id 取决于它是否透传 attrs，所以用 :deep() 兜住。 */
.requirement-hall__grid,
.portal-page__empty,
.portal-page__panel :deep(.requirement-hall__pager) {
  transition: opacity 180ms ease;
}

.requirement-hall__panel--refreshing .requirement-hall__grid,
.requirement-hall__panel--refreshing .portal-page__empty,
.requirement-hall__panel--refreshing :deep(.requirement-hall__pager) {
  opacity: 0.55;
  /* 压暗期间不接受点击，免得点到马上要被替换掉的旧卡片 */
  pointer-events: none;
}

/* 工具栏始终留在原位、保持可用：刷新期间还能改关键词、切担保方式。 */

/* 工具栏：担保方式下拉 + 关键词搜索 + 操作按钮压在同一行里。
   窄屏在文末媒体查询里改回换行。 */
.requirement-hall__toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

/* 担保方式下拉：定宽，避免切换选项时整行跟着跳宽。
   TSelect 关了 attrs 透传（`inheritAttrs: false`），根节点拿不到本文件的 scope id，
   所以只能从工具栏用 :deep() 选它——直接写 .requirement-hall__guarantee-select 是选不到的。 */
.requirement-hall__toolbar :deep(.requirement-hall__guarantee-select) {
  flex: 0 0 auto;
  width: 132px;
}

.requirement-hall__search {
  position: relative;
  display: flex;
  flex: 1 1 200px;
  min-width: 0;
  align-items: center;
}

.requirement-hall__toolbar input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(198, 210, 236, 0.86);
  border-radius: 14px;
  background: #fff;
  color: #0f172a;
  padding: 0 40px 0 14px;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background-color 180ms ease;
}

.requirement-hall__toolbar input::-webkit-search-cancel-button,
.requirement-hall__toolbar input::-webkit-search-decoration {
  display: none;
  -webkit-appearance: none;
}

.requirement-hall__search-clear {
  position: absolute;
  right: 8px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.requirement-hall__search-clear:hover {
  background: rgba(226, 232, 240, 0.66);
  color: #475569;
}

.requirement-hall__toolbar input:focus {
  border-color: rgba(37, 99, 235, 0.58);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1);
}

.requirement-hall__grid {
  align-items: stretch;
}

.requirement-hall__pager {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.requirement-hall__card {
  height: 100%;
  min-height: 188px;
  cursor: pointer;
  transition:
    transform 180ms ease,
    border-color 180ms ease,
    box-shadow 180ms ease;
}

.requirement-hall__card .requirement-hall__meta-row {
  margin-top: auto;
}

.requirement-hall__card .portal-page__card-footer {
  margin-top: 0;
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
  line-clamp: 3;
  -webkit-line-clamp: 3;
}

.requirement-hall__card .portal-page__card-footer span {
  color: #2563eb;
  font-size: 13px;
  font-weight: 800;
}

.requirement-hall__card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
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
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.requirement-hall__deal-item:first-child {
  padding-top: 2px;
}

.requirement-hall__deal-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.requirement-hall__deal-title {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
  line-height: 1.45;
}

.requirement-hall__deal-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.requirement-hall__deal-meta {
  min-width: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}

.requirement-hall__deal-rating {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(245, 158, 11, 0.22);
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 251, 235, 0.95), rgba(254, 243, 199, 0.55));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
  color: #b45309;
}

.requirement-hall__deal-rating--empty {
  border-color: rgba(148, 163, 184, 0.28);
  background: rgba(248, 250, 252, 0.9);
  box-shadow: none;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 700;
}

.requirement-hall__deal-stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  letter-spacing: -0.04em;
}

.requirement-hall__deal-star {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  color: #e7e5e4;
  font-size: 12px;
  line-height: 1;
}

.requirement-hall__deal-star.is-full {
  color: #f59e0b;
}

.requirement-hall__deal-star.is-half {
  color: transparent;
  background: linear-gradient(90deg, #f59e0b 50%, #e7e5e4 50%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.requirement-hall__deal-rating > strong {
  margin-left: 2px;
  color: #92400e;
  font-size: 12px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.requirement-hall__deal-rating-unit {
  color: #b45309;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.requirement-hall__deal-comment {
  margin: 0;
  padding: 6px 10px;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  border-left: 2px solid rgba(148, 163, 184, 0.45);
  border-radius: 0 10px 10px 0;
  background: rgba(248, 250, 252, 0.9);
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
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
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
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
  align-items: stretch;
}

.requirement-hall-detail__review-item {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.requirement-hall-detail__review-grid .requirement-hall-detail__review-item {
  grid-template-rows: auto 1fr;
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

.requirement-hall-detail__review-grid .requirement-hall-detail__review-value {
  height: 100%;
}

.requirement-hall-detail__review-grid div.requirement-hall-detail__review-value {
  display: flex;
  align-items: center;
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
  /* 窄屏：工具栏由一行拆成多行，控件各自占满 */
  .requirement-hall__toolbar {
    flex-wrap: wrap;
  }

  .requirement-hall__toolbar :deep(.requirement-hall__guarantee-select),
  .requirement-hall__search,
  .portal-page--nav .requirement-hall__header-actions {
    flex: 1 1 100%;
    width: auto;
  }

  .portal-page--nav .requirement-hall__header-actions {
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .requirement-hall__publish-btn {
    width: 100%;
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
