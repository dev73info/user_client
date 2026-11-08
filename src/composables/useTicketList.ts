import { computed, ref } from 'vue'

import {
  getTicketDetail,
  listTickets,
  markTicketRead,
  type TicketDetail,
  type TicketItem,
} from '@/api/tickets'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  countTickets,
  filterTickets,
  sortTickets,
  sumUnread,
  type TicketPriorityFilter,
  type TicketStatusFilter,
} from '@/shared/ticketDisplay'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

/**
 * 工单列表：服务端按 status / page / page_size 取数，关键词与优先级在当前页内过滤。
 * 打开详情后调用 read 接口并本地清零未读；实时推送由 `handleTicketUpdated` 接管刷新。
 */
export function useTicketList() {
  const auth = useAuthStore()
  const tickets = ref<TicketItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(PAGE_SIZE)
  const status = ref<TicketStatusFilter>('all')
  const keyword = ref('')
  const priority = ref<TicketPriorityFilter>('all')
  const loading = ref(false)
  const loadError = ref('')
  const selectedId = ref('')
  const detail = ref<TicketDetail | null>(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  let requestSeq = 0

  const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
  const filtered = computed(() =>
    filterTickets(tickets.value, {
      keyword: keyword.value,
      status: 'all',
      priority: priority.value,
    }),
  )
  const stats = computed(() => {
    const local = countTickets(tickets.value)
    return {
      total: total.value,
      pending: local.pending,
      resolved: local.resolved,
      unread: sumUnread(tickets.value),
    }
  })
  const hasFilters = computed(
    () => Boolean(keyword.value.trim()) || priority.value !== 'all' || status.value !== 'all',
  )

  async function loadTickets() {
    loading.value = true
    loadError.value = ''
    const seq = ++requestSeq
    try {
      const result = await listTickets(auth.token, {
        status: status.value,
        page: page.value,
        page_size: pageSize.value,
      })
      if (seq !== requestSeq) return
      tickets.value = sortTickets(result.items)
      total.value = result.total

      const maxPage = Math.max(1, Math.ceil(result.total / pageSize.value))
      if (page.value > maxPage) {
        page.value = maxPage
        await loadTickets()
        return
      }

      if (tickets.value.length === 0) {
        selectedId.value = ''
        detail.value = null
        return
      }
      if (!tickets.value.some((item) => item.ticket_id === selectedId.value)) {
        await loadDetail(tickets.value[0]!.ticket_id)
      }
    } catch (err) {
      if (seq === requestSeq) loadError.value = describeBackendError(err, '加载工单失败')
    } finally {
      if (seq === requestSeq) loading.value = false
    }
  }

  async function loadDetail(ticketId: string) {
    selectedId.value = ticketId
    detailError.value = ''
    detailLoading.value = true
    try {
      detail.value = await getTicketDetail(auth.token, ticketId)
      void markRead(ticketId)
    } catch (err) {
      detailError.value = describeBackendError(err, '加载工单详情失败')
    } finally {
      detailLoading.value = false
    }
  }

  async function markRead(ticketId: string) {
    try {
      await markTicketRead(auth.token, ticketId)
    } catch {
      return
    }
    tickets.value = tickets.value.map((item) =>
      item.ticket_id === ticketId ? { ...item, unread_count: 0 } : item,
    )
  }

  function setStatus(value: TicketStatusFilter) {
    if (status.value === value) return
    status.value = value
    page.value = 1
    void loadTickets()
  }

  function setPage(value: number) {
    const next = Math.min(Math.max(1, value), pageCount.value)
    if (next === page.value) return
    page.value = next
    void loadTickets()
  }

  function resetFilters() {
    keyword.value = ''
    priority.value = 'all'
    status.value = 'all'
    page.value = 1
    void loadTickets()
  }

  function replaceTicket(updated: TicketItem) {
    tickets.value = tickets.value.map((item) =>
      item.ticket_id === updated.ticket_id ? updated : item,
    )
  }

  function applyDetail(next: TicketDetail) {
    detail.value = next
    replaceTicket(next.ticket)
  }

  async function refreshSelected() {
    if (!selectedId.value) return
    await loadDetail(selectedId.value)
  }

  async function reload() {
    await loadTickets()
    await refreshSelected()
  }

  function handleTicketUpdated(ticketId: string) {
    void loadTickets()
    if (ticketId && ticketId === selectedId.value) void loadDetail(ticketId)
  }

  return {
    tickets,
    total,
    page,
    pageSize,
    status,
    keyword,
    priority,
    loading,
    loadError,
    selectedId,
    detail,
    detailLoading,
    detailError,
    filtered,
    pageCount,
    stats,
    hasFilters,
    loadTickets,
    loadDetail,
    selectTicket: loadDetail,
    setStatus,
    setPage,
    resetFilters,
    replaceTicket,
    applyDetail,
    refreshSelected,
    reload,
    handleTicketUpdated,
  }
}
