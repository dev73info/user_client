import type { TicketEvent, TicketItem } from '@/api/tickets'
import { formatBackendDateTime, parseBackendDateTime } from '@/shared/datetime'

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
    const left = parseBackendDateTime(b.updated_at)?.getTime() ?? 0
    const right = parseBackendDateTime(a.updated_at)?.getTime() ?? 0
    return left - right
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

/** 当前页未读总数；列表接口不带聚合字段，按页内条目求和。 */
export function sumUnread(items: TicketItem[]): number {
  return items.reduce((sum, item) => sum + (item.unread_count ?? 0), 0)
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
  return formatBackendDateTime(value, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hasTicketSatisfaction(ticket: TicketItem): boolean {
  return typeof ticket.satisfaction_rating === 'number' && ticket.satisfaction_rating > 0
}

export function ticketSatisfactionStars(rating?: number | null): string {
  const value = Math.max(0, Math.min(5, Math.round(rating ?? 0)))
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)}`
}

const TICKET_EVENT_LABELS: Record<string, string> = {
  created: '创建工单',
  status_change: '状态变更',
  status_changed: '状态变更',
  assigned: '分配负责人',
  claimed: '认领',
  released: '释放',
  transferred: '转交',
  replied: '回复',
  message: '回复',
  user_reply: '用户回复',
  staff_reply: '客服回复',
  internal_note: '内部备注',
  first_response: '首次响应',
  resolved: '标记已解决',
  closed: '关闭工单',
  closed_by_user: '用户关闭',
  closed_by_staff: '客服关闭',
  reopened: '重新打开',
  rated: '满意度评价',
  satisfaction: '满意度评价',
}

const TICKET_STATUS_VALUES = new Set(['open', 'processing', 'resolved', 'closed'])

export function ticketEventLabel(eventType: string): string {
  return TICKET_EVENT_LABELS[eventType] ?? eventType
}

export type TicketTimelineEntry = {
  key: string
  label: string
  at: string
  detail?: string
}

function eventDetail(event: TicketEvent): string | undefined {
  const parts: string[] = []
  // 状态值翻成中文；客服回复常常 from === to，不要显示「processing → processing」。
  if (event.from_value && event.to_value && event.from_value !== event.to_value) {
    const translate = (value: string) =>
      TICKET_STATUS_VALUES.has(value) ? ticketStatusLabel(value) : value
    parts.push(`${translate(event.from_value)} → ${translate(event.to_value)}`)
  }
  if (event.note) parts.push(event.note)
  return parts.join(' · ') || undefined
}

/**
 * 进度时间线：优先用后端 events，再用状态字段补齐缺失节点。
 * events 为空时也能从 `resolved_at` / `closed_at` 这些时间戳画出里程碑。
 */
export function buildTicketTimeline(
  ticket: TicketItem,
  events: TicketEvent[],
): TicketTimelineEntry[] {
  const entries: TicketTimelineEntry[] = events.map((event) => ({
    key: `event-${event.id}`,
    label: ticketEventLabel(event.event_type),
    at: event.created_at,
    detail: eventDetail(event),
  }))
  const hasType = (matcher: RegExp) => events.some((event) => matcher.test(event.event_type))

  if (!hasType(/^created$/)) {
    entries.push({ key: 'milestone-created', label: '创建工单', at: ticket.created_at })
  }
  if (ticket.first_response_at && !hasType(/first_response/)) {
    entries.push({
      key: 'milestone-first-response',
      label: '首次响应',
      at: ticket.first_response_at,
    })
  }
  if (ticket.resolved_at && !hasType(/resolved/)) {
    entries.push({ key: 'milestone-resolved', label: '标记已解决', at: ticket.resolved_at })
  }
  if (ticket.closed_at && !hasType(/closed/)) {
    entries.push({ key: 'milestone-closed', label: '关闭工单', at: ticket.closed_at })
  }
  if (ticket.satisfaction_rated_at && !hasType(/(rated|satisfaction)/)) {
    entries.push({
      key: 'milestone-satisfaction',
      label: '满意度评价',
      at: ticket.satisfaction_rated_at,
      detail: ticket.satisfaction_rating ? `${ticket.satisfaction_rating} 星` : undefined,
    })
  }

  return entries.sort((a, b) => {
    const left = parseBackendDateTime(a.at)?.getTime() ?? 0
    const right = parseBackendDateTime(b.at)?.getTime() ?? 0
    return left - right
  })
}
