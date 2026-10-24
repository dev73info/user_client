import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { TMessage, type SelectModelValue } from 'ui_73info'

import {
  getPublicRequirementOverview,
  listPublicRequirementSpotlights,
  type PublicRequirementSpotlightItem,
  type RequirementOverviewResp,
  type RequirementPaymentMode,
} from '@/api/requirements'
import {
  REQUIREMENT_GUARANTEE_FILTERS,
  normalizeRequirementGuaranteeFilter,
  requirementGuaranteeRequestMode,
  requirementHallEmptyTitle,
  requirementHallStats,
  requirementMatchesKeyword,
  requirementRecentDeals,
  type RequirementGuaranteeFilter,
} from '@/shared/requirementDisplay'
import { resetSeoMeta, setSeoMeta } from '@/utils/seo'

/** 需求大厅一页的条数：后端公开接口单页上限 100 条，默认 20 条一页。 */
export const HALL_PAGE_SIZE = 20

/**
 * 需求大厅（`/requirement-hall`）的列表与筛选。
 *
 * 从 `views/RequirementHallView.vue` 抽出：页面只负责排版，取数、服务端分页、担保方式筛选、
 * 关键词本地过滤、侧栏读数与空态文案、页面 SEO 都在这里。逻辑与提示文案逐段照搬，没改口径。
 *
 * 发布弹窗 → `useRequirementHallPublish`；详情弹窗 → `useRequirementHallDetail`。
 */
export function useRequirementHall() {
  const router = useRouter()
  const route = useRoute()

  const loading = ref(false)
  const overviewLoading = ref(false)
  const requirements = ref<PublicRequirementSpotlightItem[]>([])
  const hallPage = ref(1)
  const hallTotal = ref(0)
  const overview = ref<RequirementOverviewResp | null>(null)
  const keyword = ref('')
  const guaranteeFilter = ref<RequirementGuaranteeFilter>('all')

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

  /** 担保方式下拉的选项：`全部` + 两档担保方式（文案见 `@/shared/requirementDisplay`）。 */
  const guaranteeOptions = computed(() => REQUIREMENT_GUARANTEE_FILTERS)

  /** 关键词是本地过滤：一次取回的一页里再按 编号 / 标题 / 说明 / 担保方式 / 状态 搜。 */
  const filteredRequirements = computed(() =>
    requirements.value.filter((item) => requirementMatchesKeyword(item, keyword.value)),
  )

  const hallStats = computed(() => requirementHallStats(hallTotal.value, overview.value))

  /** 空态文案跟着当前生效的筛选走：关键词优先，其次担保方式，最后才是「大厅本来就没单」。 */
  const hallEmptyTitle = computed(() =>
    requirementHallEmptyTitle(keyword.value, guaranteeFilter.value),
  )

  const recentDeals = computed(() => requirementRecentDeals(overview.value?.recent_deals))

  watch(
    () => route.query.keyword,
    (value) => {
      keyword.value = typeof value === 'string' ? value.trim() : ''
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
    return requirementGuaranteeRequestMode(guaranteeFilter.value)
  }

  /**
   * 切换担保方式筛选：这是服务端筛选，换值等于换结果集，
   * 所以回到第一页重新拉取，避免停留在上一个结果集的页码上。
   */
  function onGuaranteeFilterChange(value: SelectModelValue) {
    const next = normalizeRequirementGuaranteeFilter(value)
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
    // 原来这里紧接着调一次 `openRouteRequirementDetail()`（URL 里带 requirement_id / view 时开详情）。
    // 拆分后详情在 `useRequirementHallDetail` 里，由它 watch `loading` 落回 false 来做同一件事，
    // 时机与原来一致（都在这一轮请求结束、列表替换之后）。
  }

  return {
    // 状态
    loading,
    overviewLoading,
    requirements,
    overview,
    // 分页（服务端）
    hallPage,
    hallTotal,
    // 筛选
    keyword,
    guaranteeFilter,
    guaranteeOptions,
    filteredRequirements,
    resetKeyword,
    onGuaranteeFilterChange,
    resetHallFilters,
    // 读数与空态
    hallStats,
    hallEmptyTitle,
    recentDeals,
    // 首次加载 / 就地刷新
    showHallSkeleton,
    hallRefreshing,
    // 取数
    loadHallData,
  }
}
