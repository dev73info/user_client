import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listMyAfterSalesCases, type AfterSalesCaseSummary } from '@/api/afterSales'
import {
  listConversationHistoryDisclosures,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import { useClientPagination } from '@/composables/useClientPagination'
import {
  NOTIFICATION_KIND_LABELS,
  buildNotificationCards,
  countByKind,
  filterNotificationCards,
  pendingActionCount,
  type NotificationCard,
  type NotificationKind,
} from '@/shared/notifications'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 「系统通知」页的数据层（R047 从 `views/NotificationCenterView.vue` 拆出）。
 *
 * 页面把两类系统消息统一成同一种卡片：历史沟通公开申请、解除合作案件。两支请求并行发、
 * 各自结算——某一支挂了只提示那一类，其余照常显示，一类接口抖动不该让整页变空。
 *
 * **来源只剩两类**：评论警告与平台公告走社区接口、资源过户走 `/resources/transfers/**`，
 * 这些能力在当前后端契约里一条路径都没有，已经从这一页摘掉（不是「暂无数据」，是没有这个能力）。
 *
 * 卡片映射与排序在 `shared/notifications` 里（纯函数），这里只管请求、结算、筛选与分页；
 * 卡片上的动作（公开申请投票）在 `useNotificationCardActions` 里。
 */

/** 筛选胶囊的取值：全部 + 两个类别。 */
export type NotificationKindFilter = 'all' | NotificationKind

/** 胶囊顺序：先给要处理的公开申请，再给只读的解除合作。 */
const KIND_ORDER: NotificationKind[] = ['history-disclosure', 'after-sales']

export function useNotificationCenter() {
  const route = useRoute()
  const auth = useAuthStore()

  const isDevWorkbench = computed(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)),
  )
  /** 每次调用现取令牌：store 里的令牌可能在挂载后才有（记住登录 / 跨标签页同步）。 */
  const hasToken = () => Boolean(auth.token.trim())

  const loading = ref(false)
  const disclosures = ref<ConversationHistoryDisclosure[]>([])
  const afterSales = ref<AfterSalesCaseSummary[]>([])
  const kindFilter = ref<NotificationKindFilter>('all')
  const keyword = ref('')

  const cards = computed<NotificationCard[]>(() =>
    buildNotificationCards({
      disclosures: disclosures.value,
      afterSales: afterSales.value,
      username: auth.username,
    }),
  )

  /** 各类别的条数：顶栏读数条与筛选胶囊上的数字共用一份。 */
  const kindCounts = computed(() => countByKind(cards.value))

  const kindFilters = computed<
    Array<{ value: NotificationKindFilter; label: string; count: number }>
  >(() =>
    (['all', ...KIND_ORDER] as NotificationKindFilter[]).map((value) => ({
      value,
      label: value === 'all' ? '全部' : NOTIFICATION_KIND_LABELS[value],
      count: value === 'all' ? cards.value.length : kindCounts.value[value],
    })),
  )

  const filteredCards = computed(() =>
    filterNotificationCards(cards.value, kindFilter.value, keyword.value),
  )
  const pendingActions = computed(() => pendingActionCount(cards.value))
  const filtersActive = computed(() => keyword.value.trim() !== '' || kindFilter.value !== 'all')

  /* 两类各是一次全量取回（都不分页），所以筛选与分页都在前端做（与我的合同同一套页码口径）。 */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedCards,
    resetPage,
  } = useClientPagination(filteredCards)

  // 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
  watch([kindFilter, keyword], resetPage)

  /* 展示顺序像会话：分页仍按「最新在前」切（第 1 页就是最近的一批），页内倒过来排，
     最新一条落在列表最底部，并把视口滚到底，打开就看到最新的通知。 */
  const displayCards = computed(() => [...pagedCards.value].reverse())

  async function scrollToLatest() {
    await nextTick()
    const wrap = document.querySelector<HTMLElement>('.app-scrollbar .t73-scrollbar__wrap')
    if (wrap) {
      wrap.scrollTop = wrap.scrollHeight
      return
    }
    window.scrollTo({ top: document.documentElement.scrollHeight })
  }

  watch(page, () => void scrollToLatest())

  function resetFilters() {
    kindFilter.value = 'all'
    keyword.value = ''
  }

  async function loadNotifications(showSuccess = false) {
    auth.hydrate()
    if (!hasToken()) {
      disclosures.value = []
      afterSales.value = []
    }

    loading.value = true
    // 这两支需要令牌，未登录时直接跳过，避免明知会 401 还发一次。
    const authed = hasToken()
    const [disclosuresResult, afterSalesResult] = await Promise.allSettled([
      authed
        ? listConversationHistoryDisclosures(auth.token)
        : Promise.resolve<ConversationHistoryDisclosure[]>([]),
      authed
        ? listMyAfterSalesCases(auth.token)
        : Promise.resolve<AfterSalesCaseSummary[]>([]),
    ])

    if (disclosuresResult.status === 'fulfilled') {
      disclosures.value = disclosuresResult.value
    } else {
      TMessage.error(
        disclosuresResult.reason instanceof Error
          ? disclosuresResult.reason.message
          : '加载公开申请失败',
      )
    }

    if (afterSalesResult.status === 'fulfilled') {
      afterSales.value = afterSalesResult.value
    } else {
      TMessage.error(
        afterSalesResult.reason instanceof Error
          ? afterSalesResult.reason.message
          : '加载解除合作案件失败',
      )
    }

    loading.value = false
    if (showSuccess) {
      TMessage.success('系统通知已刷新')
    }
  }

  /** 投票后只重拉公开申请那一支：另几类不会因为这一票而变化。 */
  async function loadDisclosures() {
    if (!hasToken()) return
    try {
      disclosures.value = await listConversationHistoryDisclosures(auth.token)
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载公开申请失败')
    }
  }

  function emptyTitle() {
    if (keyword.value.trim()) {
      return '没有匹配的系统通知'
    }
    if (kindFilter.value !== 'all') {
      return `暂无${NOTIFICATION_KIND_LABELS[kindFilter.value]}`
    }
    return '暂无系统通知'
  }

  onMounted(async () => {
    await loadNotifications()
    await scrollToLatest()
  })

  return {
    isDevWorkbench,
    loading,
    cards,
    kindFilters,
    kindFilter,
    keyword,
    filteredCards,
    filteredTotal,
    pendingActions,
    filtersActive,
    displayCards,
    page,
    pageSize,
    emptyTitle,
    resetFilters,
    loadNotifications,
    loadDisclosures,
  }
}
