import type { TicketItem, TicketPriority, TicketStatus } from '@/api/tickets'

/** 区块组件不直接引 `@/api/*`，工单相关的三个类型从这里转出（只转类型，不转实现）。 */
export type { TicketDetail, TicketItem, TicketPriority, TicketStatus } from '@/api/tickets'

/**
 * 工单中心的展示口径：状态 / 优先级的文案与配色、行排序与筛选、时间格式化。
 *
 * 原先这些都写在 `TicketCenterView.vue` 里。拆页面时挪到此处，因为列表面板与详情面板
 * 是两套工作台（开发者 / 门户）共用的：同一张工单在两个面板里要给出同一种状态文案，
 * 排序位次与筛选口径也只有一份，不然左栏排序和右栏筛选会各算各的。
 *
 * 只放纯函数与常量，不碰 ref / 路由 / 接口。
 */

/** 优先级下拉的选项：新建弹窗与筛选器共用，筛选项前面加一条「全部优先级」。 */
export const TICKET_PRIORITY_OPTIONS: Array<{ value: TicketPriority; label: string }> = [
  { value: 'low', label: '低优先级' },
  { value: 'normal', label: '普通' },
  { value: 'high', label: '高优先级' },
  { value: 'urgent', label: '紧急' },
]

export const TICKET_STATUS_OPTIONS: Array<{ value: 'all' | TicketStatus; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'open', label: '待处理' },
  { value: 'processing', label: '处理中' },
  { value: 'resolved', label: '已解决' },
  { value: 'closed', label: '已关闭' },
]

export const TICKET_PRIORITY_FILTER_OPTIONS: Array<{
  value: 'all' | TicketPriority
  label: string
}> = [{ value: 'all', label: '全部优先级' }, ...TICKET_PRIORITY_OPTIONS]

/** 已关闭 / 已解决视为「可收缩」，列表行精简展示。 */
export function isCollapsedTicket(status: TicketStatus) {
  return status === 'closed' || status === 'resolved'
}

/**
 * 待处理 / 处理中置顶，已解决 / 已关闭靠后；同状态内按更新时间倒序。
 * 不做原地排序：来源是响应式数组，原地 sort 会让「顺序」与「数据」的依赖缠在一起。
 */
export function sortTickets(items: TicketItem[]): TicketItem[] {
  const rank: Record<TicketStatus, number> = {
    open: 0,
    processing: 1,
    resolved: 2,
    closed: 3,
  }
  return [...items].sort((a, b) => {
    const diff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    if (diff !== 0) return diff
    return new Date(b.updated_at ?? '').getTime() - new Date(a.updated_at ?? '').getTime()
  })
}

/** 关键词只匹配标题、工单号与分类，三处任一命中即保留。 */
export function filterTickets(
  items: TicketItem[],
  filters: {
    keyword: string
    status: 'all' | TicketStatus
    priority: 'all' | TicketPriority
  },
): TicketItem[] {
  const keyword = filters.keyword.trim().toLowerCase()
  return items.filter((ticket) => {
    if (filters.status !== 'all' && ticket.status !== filters.status) {
      return false
    }
    if (filters.priority !== 'all' && ticket.priority !== filters.priority) {
      return false
    }
    if (!keyword) {
      return true
    }
    return [ticket.subject, ticket.ticket_id, ticket.category ?? ''].some((field) =>
      field.toLowerCase().includes(keyword),
    )
  })
}

/** 读数条三格：全部 / 处理中（待处理 + 处理中）/ 已完成（已解决 + 已关闭）。 */
export function countTickets(items: TicketItem[]) {
  return {
    total: items.length,
    pending: items.filter((item) => item.status === 'open' || item.status === 'processing').length,
    resolved: items.filter((item) => item.status === 'resolved' || item.status === 'closed').length,
  }
}

/** 时间列：空值与非法值各自原样回退，合法值按「月-日 时:分」展示。 */
export function formatTicketTime(value?: string | null) {
  if (!value) {
    return '暂未更新'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTicketStatus(status: TicketStatus) {
  const mapping: Record<TicketStatus, string> = {
    open: '待处理',
    processing: '处理中',
    resolved: '已解决',
    closed: '已关闭',
  }
  return mapping[status]
}

export function formatTicketPriority(priority: TicketPriority) {
  const mapping: Record<TicketPriority, string> = {
    low: '低',
    normal: '普通',
    high: '高',
    urgent: '紧急',
  }
  return mapping[priority]
}

/**
 * 开发者侧的状态标签走统一层的胶囊（.dev-chip 及其变体），
 * 与需求大厅、我的接单的状态标签同一套。
 */
export function ticketStatusChipClass(status: TicketStatus) {
  if (status === 'open') {
    return 'dev-chip dev-chip--warm'
  }
  if (status === 'resolved') {
    return 'dev-chip dev-chip--cyan'
  }
  if (status === 'closed') {
    return 'dev-chip dev-chip--muted'
  }
  return 'dev-chip'
}

/**
 * 用户工作台侧的状态徽标：待处理、处理中、已解决各自取一档状态色，已关闭是终态走中性档。
 */
export function ticketStatusBadgeClass(status: TicketStatus) {
  if (status === 'open') {
    return 'wb-badge wb-badge--warning'
  }
  if (status === 'processing') {
    return 'wb-badge wb-badge--accent'
  }
  if (status === 'resolved') {
    return 'wb-badge wb-badge--success'
  }
  return 'wb-badge'
}

/**
 * 客服回复的来源徽标：两侧都取该侧「提示」色
 * （开发者侧是金 .dev-chip--warm、门户侧是琥珀 .wb-badge--warning），与状态标签同一套颜色来源。
 */
export function ticketSenderBadgeClass(dev: boolean) {
  return dev ? 'dev-chip dev-chip--warm' : 'wb-badge wb-badge--warning'
}

/** 消息来源文案：自己 / 管理员 / 开发者 / 兜底「官方回复」。 */
export function ticketSenderBadgeLabel(sender: string, role: string, username: string) {
  if (sender === username) {
    return '自己'
  }
  if (role === 'super_admin') {
    return '官方管理员'
  }
  if (role === 'dev') {
    return '官方开发者'
  }
  return '官方回复'
}
