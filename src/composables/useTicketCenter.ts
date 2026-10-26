import { computed, onMounted, ref } from 'vue'

import {
  closeTicket,
  createTicket,
  getTicketDetail,
  listTickets,
  replyTicket,
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

  onMounted(() => {
    auth.hydrate()
    void loadTickets()
  })

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
