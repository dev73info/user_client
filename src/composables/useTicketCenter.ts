import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  closeTicket,
  createTicket,
  getTicketDetail,
  listTickets,
  replyTicket,
  ticketWsUrl,
  type TicketDetail,
  type TicketItem,
} from '@/api/tickets'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  countTickets,
  filterTickets,
  sortTickets,
  type TicketPriorityFilter,
  type TicketStatusFilter,
} from '@/shared/ticketDisplay'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export function useTicketCenter() {
  const auth = useAuthStore()
  const loading = ref(false)
  const detailLoading = ref(false)
  const creating = ref(false)
  const replying = ref(false)
  const closing = ref(false)
  const loadError = ref('')
  const detailError = ref('')
  const createError = ref('')
  const replyError = ref('')
  const tickets = ref<TicketItem[]>([])
  const selectedId = ref('')
  const detail = ref<TicketDetail | null>(null)
  const keyword = ref('')
  const status = ref<TicketStatusFilter>('all')
  const priority = ref<TicketPriorityFilter>('all')
  const composeOpen = ref(false)
  const subject = ref('')
  const category = ref('')
  const newPriority = ref('normal')
  const content = ref('')
  const replyContent = ref('')
  const realtimeWarning = ref('')
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempt = 0
  let disposed = false

  const stats = computed(() => countTickets(tickets.value))
  const filtered = computed(() =>
    filterTickets(tickets.value, {
      keyword: keyword.value,
      status: status.value,
      priority: priority.value,
    }),
  )
  const selected = computed(() => tickets.value.find((item) => item.ticket_id === selectedId.value))
  const hasFilters = computed(
    () => Boolean(keyword.value.trim()) || status.value !== 'all' || priority.value !== 'all',
  )

  async function loadDetail(ticketId: string) {
    selectedId.value = ticketId
    detailError.value = ''
    detailLoading.value = true
    try {
      detail.value = await getTicketDetail(auth.token, ticketId)
    } catch (err) {
      detailError.value = describeBackendError(err, '加载工单详情失败')
    } finally {
      detailLoading.value = false
    }
  }

  async function loadTickets() {
    loading.value = true
    loadError.value = ''
    try {
      tickets.value = sortTickets(await listTickets(auth.token))
      if (tickets.value.length === 0) {
        selectedId.value = ''
        detail.value = null
        return
      }
      if (!tickets.value.some((item) => item.ticket_id === selectedId.value)) {
        await loadDetail(tickets.value[0]!.ticket_id)
      }
    } catch (err) {
      loadError.value = describeBackendError(err, '加载工单失败')
    } finally {
      loading.value = false
    }
  }

  function resetFilters() {
    keyword.value = ''
    status.value = 'all'
    priority.value = 'all'
  }

  function openCompose() {
    subject.value = ''
    category.value = ''
    newPriority.value = 'normal'
    content.value = ''
    createError.value = ''
    composeOpen.value = true
  }

  async function submitCreate() {
    createError.value = ''
    if (!subject.value.trim()) {
      createError.value = '请填写工单标题'
      return
    }
    if (!content.value.trim()) {
      createError.value = '请填写问题描述'
      return
    }
    creating.value = true
    try {
      const created = await createTicket(auth.token, {
        subject: subject.value.trim(),
        content: content.value.trim(),
        category: category.value.trim() || null,
        priority: newPriority.value,
      })
      composeOpen.value = false
      TMessage.success('工单已提交')
      await loadTickets()
      await loadDetail(created.ticket_id)
    } catch (err) {
      createError.value = describeBackendError(err, '创建工单失败')
    } finally {
      creating.value = false
    }
  }

  async function submitReply() {
    if (!selected.value) return
    replyError.value = ''
    if (!replyContent.value.trim()) {
      replyError.value = '请输入回复内容'
      return
    }
    replying.value = true
    try {
      detail.value = await replyTicket(auth.token, selected.value.ticket_id, {
        content: replyContent.value.trim(),
      })
      replyContent.value = ''
      await loadTickets()
    } catch (err) {
      replyError.value = describeBackendError(err, '回复工单失败')
    } finally {
      replying.value = false
    }
  }

  async function submitClose() {
    if (!selected.value) return
    detailError.value = ''
    closing.value = true
    try {
      const updated = await closeTicket(auth.token, selected.value.ticket_id)
      tickets.value = tickets.value.map((item) =>
        item.ticket_id === updated.ticket_id ? updated : item,
      )
      if (detail.value) detail.value = { ...detail.value, ticket: updated }
      TMessage.success('工单已关闭')
    } catch (err) {
      detailError.value = describeBackendError(err, '关闭工单失败')
    } finally {
      closing.value = false
    }
  }

  function connectRealtime() {
    const token = auth.token.trim()
    if (!token || socket || disposed) return
    let next: WebSocket
    try {
      next = new WebSocket(ticketWsUrl(token))
    } catch {
      scheduleReconnect()
      return
    }
    socket = next
    next.onopen = () => {
      reconnectAttempt = 0
      realtimeWarning.value = ''
    }
    next.onmessage = (event: MessageEvent) => {
      if (socket !== next || typeof event.data !== 'string') return
      try {
        const payload = JSON.parse(event.data) as { event?: string; ticket_id?: string }
        if (payload.event && payload.event !== 'ticket.updated') return
        void loadTickets()
        if (payload.ticket_id === selectedId.value) void loadDetail(payload.ticket_id)
      } catch {
        // 无法识别的推送不改变当前列表。
      }
    }
    next.onerror = () => {
      next.close()
    }
    next.onclose = () => {
      if (socket !== next) return
      socket = null
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (disposed) return
    // 连续 5 次连不上（含 401/403 握手失败）就停下并给出可见提示。
    if (reconnectAttempt >= 5) {
      realtimeWarning.value = '实时连接不可用，请刷新页面'
      return
    }
    const delay = Math.min(3000 * 2 ** reconnectAttempt, 15_000)
    reconnectAttempt += 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connectRealtime()
    }, delay)
  }

  function disconnectRealtime() {
    disposed = true
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    const current = socket
    socket = null
    current?.close()
  }

  onMounted(() => {
    auth.hydrate()
    void loadTickets()
    connectRealtime()
  })

  onBeforeUnmount(disconnectRealtime)

  return {
    auth,
    loading,
    detailLoading,
    creating,
    replying,
    closing,
    loadError,
    detailError,
    createError,
    replyError,
    tickets,
    selectedId,
    detail,
    keyword,
    status,
    priority,
    composeOpen,
    subject,
    category,
    newPriority,
    content,
    replyContent,
    realtimeWarning,
    stats,
    filtered,
    selected,
    hasFilters,
    loadTickets,
    loadDetail,
    resetFilters,
    openCompose,
    submitCreate,
    submitReply,
    submitClose,
  }
}
