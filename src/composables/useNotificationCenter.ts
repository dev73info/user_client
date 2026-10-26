import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { listMyAfterSalesCases, type AfterSalesCaseSummary } from '@/api/afterSales'
import { listMyCommunityCommentWarnings, type CommunityCommentWarning } from '@/api/community'
import {
  listConversationHistoryDisclosures,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import { useClientPagination } from '@/composables/useClientPagination'
import { describeBackendError } from '@/shared/backendErrorText'
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
 * 页面把三类系统消息统一成同一种卡片：历史沟通公开申请、解除合作案件、本人评论警告。
 * 三支请求并行发、各自结算——某一支挂了只提示那一类，其余照常显示。
 * 评论警告接口失败时保留持续可见的错误与重试入口，不把失败当成零条通知。
 *
 * 卡片映射与排序在 `shared/notifications` 里（纯函数），这里只管请求、结算、筛选与分页；
 * 卡片上的动作（公开申请投票）在 `useNotificationCardActions` 里。
 */

/** 筛选胶囊的取值：全部 + 三个类别。 */
export type NotificationKindFilter = 'all' | NotificationKind

/** 胶囊顺序保留原两类，评论警告追加为只读类别。 */
const KIND_ORDER: NotificationKind[] = ['history-disclosure', 'after-sales', 'comment-warning']

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
  const commentWarnings = ref<CommunityCommentWarning[]>([])
  const commentWarningsError = ref('')
  const commentWarningsLoading = ref(false)
  const kindFilter = ref<NotificationKindFilter>('all')
  const keyword = ref('')

  const cards = computed<NotificationCard[]>(() =>
    buildNotificationCards({
      disclosures: disclosures.value,
      afterSales: afterSales.value,
      commentWarnings: commentWarnings.value,
      username: auth.username,
    }),
  )
  const cardsTotal = computed<number | null>(() =>
    commentWarningsError.value && cards.value.length === 0 ? null : cards.value.length,
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
      commentWarnings.value = []
      commentWarningsError.value = ''
    }

    loading.value = true
    // 三支都需要令牌，未登录时直接跳过，避免明知会 401 还发一次。
    const authed = hasToken()
    const [disclosuresResult, afterSalesResult, commentWarningsResult] = await Promise.allSettled([
      authed
        ? listConversationHistoryDisclosures(auth.token)
        : Promise.resolve<ConversationHistoryDisclosure[]>([]),
      authed ? listMyAfterSalesCases(auth.token) : Promise.resolve<AfterSalesCaseSummary[]>([]),
      authed
        ? listMyCommunityCommentWarnings(auth.token)
        : Promise.resolve<CommunityCommentWarning[]>([]),
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

    if (commentWarningsResult.status === 'fulfilled') {
      commentWarnings.value = commentWarningsResult.value
      commentWarningsError.value = ''
    } else {
      commentWarningsError.value = describeBackendError(
        commentWarningsResult.reason,
        '加载评论警告失败',
      )
    }

    loading.value = false
    if (showSuccess && !commentWarningsError.value) {
      TMessage.success('系统通知已刷新')
    }
  }

  /** 警告接口的局部重试：不影响其他两类卡片，也不在失败时清掉已有警告。 */
  async function loadCommentWarnings() {
    if (commentWarningsLoading.value) return
    auth.hydrate()
    if (!hasToken()) {
      commentWarnings.value = []
      commentWarningsError.value = ''
      return
    }
    commentWarningsLoading.value = true
    try {
      commentWarnings.value = await listMyCommunityCommentWarnings(auth.token)
      commentWarningsError.value = ''
    } catch (error) {
      commentWarningsError.value = describeBackendError(error, '加载评论警告失败')
    } finally {
      commentWarningsLoading.value = false
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
    cardsTotal,
    commentWarningsError,
    commentWarningsLoading,
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
    loadCommentWarnings,
    loadDisclosures,
  }
}
