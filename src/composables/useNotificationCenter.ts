import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  listCommunityPosts,
  listMyCommentWarnings,
  type CommentWarning,
  type CommunityPost,
} from '@/api/community'
import { listMyAfterSalesCases, type AfterSalesCase } from '@/api/afterSales'
import {
  listConversationHistoryDisclosures,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import {
  listMyResourceTransferInbox,
  listMyResourceTransfers,
  type ResourceTransferPayload,
} from '@/api/resourceTransfers'
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
import { describeTransferError } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 「系统通知」页的数据层（R047 从 `views/NotificationCenterView.vue` 拆出）。
 *
 * 页面把四类系统消息统一成同一种卡片：评论警告、历史沟通公开申请、解除合作案件、平台公告，
 * 开发者工作台再加一类资源过户。四支请求并行发、各自结算——某一支挂了只提示那一类，
 * 其余照常显示，一类接口抖动不该让整页变空。
 *
 * 两个工作台共用这一页（用户端 workbench-notifications / 开发者端 dev-notifications），
 * `isDevWorkbench` 决定两件事：过户那两支要不要拉、过户这一类要不要进筛选胶囊。
 *
 * 卡片映射与排序在 `shared/notifications` 里（纯函数），这里只管请求、结算、筛选与分页；
 * 卡片上的动作（投票 / 同意拒绝过户 / 撤销）在 `useNotificationCardActions` 里。
 */

/** 筛选胶囊的取值：全部 + 五个类别。 */
export type NotificationKindFilter = 'all' | NotificationKind

/** 胶囊顺序：先给要处理的三类，再给两类只读通知；过户那一格只在开发者工作台出现。 */
const KIND_ORDER: NotificationKind[] = [
  'comment-warning',
  'history-disclosure',
  'resource-transfer',
  'after-sales',
  'announcement',
]

/** 平台公告一次取回的上限：公告卡只做告知，翻十几页公告没有意义，取最近一批即可。 */
const ANNOUNCEMENT_LIMIT = 50

export function useNotificationCenter() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const isDevWorkbench = computed(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)),
  )
  /** 每次调用现取令牌：store 里的令牌可能在挂载后才有（记住登录 / 跨标签页同步）。 */
  const hasToken = () => Boolean(auth.token.trim())

  const loading = ref(false)
  const warnings = ref<CommentWarning[]>([])
  const disclosures = ref<ConversationHistoryDisclosure[]>([])
  const afterSales = ref<AfterSalesCase[]>([])
  const announcements = ref<CommunityPost[]>([])
  const transferInbox = ref<ResourceTransferPayload[]>([])
  const myTransfers = ref<ResourceTransferPayload[]>([])
  const warningError = ref('')
  const kindFilter = ref<NotificationKindFilter>('all')
  const keyword = ref('')

  const cards = computed<NotificationCard[]>(() =>
    buildNotificationCards({
      warnings: warnings.value,
      disclosures: disclosures.value,
      afterSales: afterSales.value,
      announcements: announcements.value,
      // 过户只在开发者工作台出现：用户端就算拿到了数据也不该混进列表。
      transferInbox: isDevWorkbench.value ? transferInbox.value : [],
      myTransfers: isDevWorkbench.value ? myTransfers.value : [],
      username: auth.username,
    }),
  )

  /** 各类别的条数：顶栏读数条与筛选胶囊上的数字共用一份。 */
  const kindCounts = computed(() => countByKind(cards.value))

  const kindFilters = computed<
    Array<{ value: NotificationKindFilter; label: string; count: number }>
  >(() =>
    (['all', ...KIND_ORDER] as NotificationKindFilter[])
      .map((value) => ({
        value,
        label: value === 'all' ? '全部' : NOTIFICATION_KIND_LABELS[value],
        count: value === 'all' ? cards.value.length : kindCounts.value[value],
      }))
      .filter((option) => option.value !== 'resource-transfer' || isDevWorkbench.value),
  )

  const filteredCards = computed(() =>
    filterNotificationCards(cards.value, kindFilter.value, keyword.value),
  )
  const pendingActions = computed(() => pendingActionCount(cards.value))
  const filtersActive = computed(() => keyword.value.trim() !== '' || kindFilter.value !== 'all')

  /* 四类各是一次全量取回（评论警告与公开申请都不分页，公告取上限 50 条），
     所以筛选与分页都在前端做（与我的收藏、我的合同同一套页码口径）。 */
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
      warnings.value = []
      disclosures.value = []
      afterSales.value = []
      transferInbox.value = []
      myTransfers.value = []
    }

    loading.value = true
    warningError.value = ''
    // 公告是公开接口，未登录也能取；另几支需要令牌，未登录时直接跳过，避免明知会 401 还发一次。
    const authed = hasToken()
    // 过户只在开发者工作台出现，与主请求并行拉，失败只提示这一类，不影响其余通知。
    const transfersTask = isDevWorkbench.value ? loadTransfers() : Promise.resolve()
    const [warningsResult, disclosuresResult, afterSalesResult, announcementsResult] =
      await Promise.allSettled([
        authed ? listMyCommentWarnings(auth.token) : Promise.resolve<CommentWarning[]>([]),
        authed
          ? listConversationHistoryDisclosures(auth.token)
          : Promise.resolve<ConversationHistoryDisclosure[]>([]),
        // 案件列表接口回的是分页包（items + 解除合作窗口状态），这里只要案件本身。
        authed
          ? listMyAfterSalesCases(auth.token).then((page) => page.items)
          : Promise.resolve<AfterSalesCase[]>([]),
        listCommunityPosts({ tag: '公告', limit: ANNOUNCEMENT_LIMIT, offset: 0 }),
      ])

    if (warningsResult.status === 'fulfilled') {
      warnings.value = warningsResult.value
    } else {
      warningError.value =
        warningsResult.reason instanceof Error ? warningsResult.reason.message : '加载评论警告失败'
    }

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

    if (announcementsResult.status === 'fulfilled') {
      // 只认已发布的公告：待审核/被驳回的帖子不该出现在用户的通知里。
      announcements.value = announcementsResult.value.filter((post) => post.status === 'published')
    } else {
      TMessage.error(
        announcementsResult.reason instanceof Error
          ? announcementsResult.reason.message
          : '加载平台公告失败',
      )
    }

    await transfersTask
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

  /** 拉取「待我同意」与「我发起的」两份过户列表。 */
  async function loadTransfers() {
    if (!hasToken() || !isDevWorkbench.value) return
    try {
      const [inbox, mine] = await Promise.all([
        listMyResourceTransferInbox(auth.token),
        listMyResourceTransfers(auth.token),
      ])
      transferInbox.value = inbox
      myTransfers.value = mine
    } catch (error) {
      const { message } = describeTransferError(error, '加载资源过户失败')
      TMessage.warning(message)
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

  /** 公告卡片整块可点：进社区帖详情。 */
  function openAnnouncement(card: NotificationCard) {
    if (card.postId == null) return
    void router.push({ name: 'community-post', params: { postId: card.postId } })
  }

  onMounted(async () => {
    await loadNotifications()
    await scrollToLatest()
  })

  return {
    isDevWorkbench,
    loading,
    warningError,
    cards,
    kindCounts,
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
    transferInbox,
    myTransfers,
    emptyTitle,
    resetFilters,
    loadNotifications,
    loadDisclosures,
    loadTransfers,
    openAnnouncement,
  }
}
