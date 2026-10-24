import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  closeTicket,
  createTicket,
  getTicketDetail,
  listTickets,
  replyTicket,
  type CreateTicketPayload,
  type TicketDetail,
  type TicketItem,
  type TicketPriority,
  type TicketStatus,
} from '@/api/tickets'
import { useClientPagination } from '@/composables/useClientPagination'
import { useAuthStore } from '@/stores/auth'
import { countTickets, filterTickets, sortTickets } from '@/shared/ticketDisplay'
import { TMessage } from 'ui_73info'

/**
 * 工单中心的状态与取数（用户工作台 / 开发者工作台共用一页）。
 *
 * 页面只剩四块展示组件：读数条、左列表、右详情、新建弹窗。它们都不碰路由、接口与提示，
 * 只接收展示值、用 `update:*` / 具名事件把动作递回来；取数、筛选、分页与提交都在这里。
 *
 * 两套工作台靠路由判定：用户工作台入口是 workbench-tickets（门户体系），
 * 开发者工作台入口是 dev-tickets（路由带 devArea，见 router/dev.ts），
 * 与消息中心同一套做法——页面自己按 meta 判断当前落在哪一侧，样式分别落到两套令牌上。
 */
export function useTicketCenter() {
  const route = useRoute()
  const auth = useAuthStore()

  const isDevWorkbench = computed(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)),
  )

  const loading = ref(false)
  const detailLoading = ref(false)
  const creating = ref(false)
  const replying = ref(false)
  const closing = ref(false)

  const tickets = ref<TicketItem[]>([])
  const selectedTicketId = ref('')
  const currentDetail = ref<TicketDetail | null>(null)

  const composeOpen = ref(false)
  const newSubject = ref('')
  const newCategory = ref('')
  const newPriority = ref<TicketPriority>('normal')
  const newContent = ref('')
  const replyContent = ref('')

  const searchKeyword = ref('')
  const statusFilter = ref<'all' | TicketStatus>('all')
  const priorityFilter = ref<'all' | TicketPriority>('all')

  const selectedTicket = computed(
    () => tickets.value.find((item) => item.ticket_id === selectedTicketId.value) ?? null,
  )
  const ticketStats = computed(() => countTickets(tickets.value))
  const sortedTickets = computed(() => sortTickets(tickets.value))
  const visibleTickets = computed(() =>
    filterTickets(sortedTickets.value, {
      keyword: searchKeyword.value,
      status: statusFilter.value,
      priority: priorityFilter.value,
    }),
  )
  const hasActiveFilter = computed(
    () =>
      statusFilter.value !== 'all' ||
      priorityFilter.value !== 'all' ||
      searchKeyword.value.trim() !== '',
  )

  /*
   * 分页与其余菜单页同构（资源项目、需求大厅、团队资源、版本列表都带表尾分页器）。
   * 本页工单一次取回全部、筛选在前端做，所以这里是客户端切片，不走服务端页码。
   */
  const {
    page,
    pageSize,
    total: filteredTotal,
    paged: pagedTickets,
  } = useClientPagination(visibleTickets)

  /* 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。 */
  watch([searchKeyword, statusFilter, priorityFilter], () => {
    page.value = 1
  })

  function resetFilters() {
    searchKeyword.value = ''
    statusFilter.value = 'all'
    priorityFilter.value = 'all'
  }

  function resetCreateForm() {
    newSubject.value = ''
    newCategory.value = ''
    newPriority.value = 'normal'
    newContent.value = ''
  }

  function openCompose() {
    composeOpen.value = true
  }

  async function loadDetail(ticketId: string) {
    if (!auth.token || !ticketId) {
      currentDetail.value = null
      return
    }

    detailLoading.value = true
    try {
      currentDetail.value = await getTicketDetail(auth.token, ticketId)
      selectedTicketId.value = ticketId
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载工单详情失败')
    } finally {
      detailLoading.value = false
    }
  }

  async function loadTickets(preferredTicketId?: string) {
    if (!auth.token) {
      tickets.value = []
      currentDetail.value = null
      return
    }

    loading.value = true
    try {
      const items = await listTickets(auth.token)
      tickets.value = items
      // 默认选中排序后的第一张（优先展示待处理 / 处理中）
      const targetId =
        preferredTicketId || selectedTicketId.value || sortedTickets.value[0]?.ticket_id || ''
      if (targetId) {
        await loadDetail(targetId)
      } else {
        selectedTicketId.value = ''
        currentDetail.value = null
      }
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载工单失败')
    } finally {
      loading.value = false
    }
  }

  async function submitCreate() {
    if (!auth.token) {
      TMessage.error('请先登录')
      return
    }

    const trimmedSubject = newSubject.value.trim()
    const trimmedContent = newContent.value.trim()

    if (trimmedSubject.length < 2) {
      TMessage.warning('工单标题至少需要 2 个字符')
      return
    }

    if (trimmedContent.length < 5) {
      TMessage.warning('问题描述至少需要 5 个字符')
      return
    }

    const payload: CreateTicketPayload = {
      subject: trimmedSubject,
      category: newCategory.value.trim() || undefined,
      priority: newPriority.value,
      content: trimmedContent,
    }

    creating.value = true
    try {
      const created = await createTicket(auth.token, payload)
      resetCreateForm()
      composeOpen.value = false
      TMessage.success('工单已创建')
      await loadTickets(created.ticket_id)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '创建工单失败')
    } finally {
      creating.value = false
    }
  }

  async function submitReply() {
    if (!auth.token || !selectedTicketId.value) {
      return
    }

    replying.value = true
    try {
      currentDetail.value = await replyTicket(auth.token, selectedTicketId.value, {
        content: replyContent.value.trim(),
      })
      replyContent.value = ''
      TMessage.success('回复已发送')
      await loadTickets(selectedTicketId.value)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '回复工单失败')
    } finally {
      replying.value = false
    }
  }

  async function submitClose() {
    if (!auth.token || !selectedTicketId.value) {
      return
    }

    closing.value = true
    try {
      await closeTicket(auth.token, selectedTicketId.value)
      TMessage.success('工单已关闭')
      await loadTickets(selectedTicketId.value)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '关闭工单失败')
    } finally {
      closing.value = false
    }
  }

  onMounted(async () => {
    auth.hydrate()
    await loadTickets()
  })

  return {
    // 身份与工作台
    isDevWorkbench,
    username: computed(() => auth.username),
    // 列表与详情
    loading,
    detailLoading,
    creating,
    replying,
    closing,
    tickets,
    selectedTicket,
    selectedTicketId,
    currentDetail,
    ticketStats,
    pagedTickets,
    filteredTotal,
    // 工具栏
    searchKeyword,
    statusFilter,
    priorityFilter,
    hasActiveFilter,
    page,
    pageSize,
    // 新建弹窗
    composeOpen,
    newSubject,
    newCategory,
    newPriority,
    newContent,
    replyContent,
    // 动作
    openCompose,
    resetFilters,
    refresh: () => loadTickets(),
    loadDetail,
    submitCreate,
    submitReply,
    submitClose,
  }
}
