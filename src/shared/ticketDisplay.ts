import type { TicketItem } from '@/api/tickets'

export type TicketStatusFilter = 'all' | 'open' | 'processing' | 'resolved' | 'closed'
export type TicketPriorityFilter = 'all' | 'low' | 'normal' | 'high' | 'urgent'

export const TICKET_PRIORITY_OPTIONS: ReadonlyArray<{
  value: TicketPriorityFilter
  label: string
}> = [
  { value: 'low', label: '低优先级' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

export const TICKET_STATUS_FILTER_OPTIONS: Array<{ value: TicketStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

export const TICKET_PRIORITY_FILTER_OPTIONS: Array<{ value: TicketPriorityFilter; label: string }> =
  [{ value: 'all', label: '全部优先级' }, ...TICKET_PRIORITY_OPTIONS]

export function sortTickets(items: TicketItem[]): TicketItem[] {
  const rank: Record<string, number> = { open: 0, processing: 1, resolved: 2, closed: 3 }
  return [...items].sort((a, b) => {
    const rankDifference = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (rankDifference !== 0) return rankDifference
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })
}

export function filterTickets(
  items: TicketItem[],
  filters: { keyword: string; status: TicketStatusFilter; priority: TicketPriorityFilter },
): TicketItem[] {
  const keyword = filters.keyword.trim().toLowerCase()
  return items.filter((ticket) => {
    if (filters.status !== 'all' && ticket.status !== filters.status) return false
    if (filters.priority !== 'all' && ticket.priority !== filters.priority) return false
    if (!keyword) return true
    return [ticket.subject, ticket.ticket_id, ticket.category ?? ''].some((value) =>
      value.toLowerCase().includes(keyword),
    )
  })
}

export function countTickets(items: TicketItem[]) {
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'open' || item.status === 'processing').length,
    resolved: items.filter((item) => item.status === 'resolved' || item.status === 'closed').length,
  }
}

export function ticketStatusLabel(status: string) {
  return (
    {
      open: '待处理',
      processing: '处理中',
      resolved: '已解决',
      closed: '已关闭',
    }[status] ?? status
  )
}

export function ticketPriorityLabel(priority: string) {
  return (
    {
      low: '低优先级',
      normal: '普通',
      high: '高优先级',
      urgent: '紧急',
    }[priority] ?? priority
  )
}

export function formatTicketTime(value?: string | null) {
  if (!value) return '暂未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
