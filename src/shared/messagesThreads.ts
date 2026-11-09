import type { RequirementConversation } from '@/shared/conversations'
import type { RequirementItem, RequirementPaymentMode, RequirementStatus } from '@/api/requirements'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { parseBackendDateTime } from '@/shared/datetime'

/**
 * 消息中心的展示口径（纯函数，不碰 store / 路由 / 接口）。
 *
 * 这一层回答的是「一条会话在列表里长什么样」：状态文案与色调、支付模式、对方是谁、
 * 上一次动静、最近一条预览、排序时间。视图与列表组件只取结果渲染，不再各自算一遍。
 */

export type MessageFilter = 'all' | 'active' | 'pending'

/** 会话行的状态色调：决定左侧色条与状态胶囊的颜色。
 *  四档只对 requirementStatusLabel 里已有的状态值分组，不新增业务语义。 */
export type ThreadTone = 'attention' | 'active' | 'done' | 'closed'
export type MessageThread = {
  key: string
  kind: 'conversation' | 'pending' | 'resource'
  /** 需求沟通 / 插件咨询：决定打开哪套弹窗与路由 query。 */
  scene: 'requirement' | 'resource'
  requirementId: string
  /** 已开启会话的编号；「会话待开启」行没有。 */
  conversationId?: string
  /** 资源（插件）编号；只有插件咨询行有。 */
  resourceId?: number
  /**
   * 选中的业务键：需求行按需求编号、插件咨询按会话编号。
   *
   * 与 `key` 分开是因为「会话待开启」行和它补建后的会话行要算同一行：
   * 两者都按 `requirement:<id>` 命中路由 query。
   */
  selectionKey: string
  title: string
  statusLabel: string
  tone: ThreadTone
  modeLabel: string
  /** 列表行第二段的「编号 · 模式」整串（需求/插件两种口径都在这里拼）。 */
  metaLabel: string
  partnerLabel: string
  lastLabel: string
  description: string
  actionLabel: string
  /** 查看者未读的消息数（后端口径，见 shared/conversations 的 unread_count）。 */
  unreadCount: number
  /** 查看者是否置顶了这一行（偏好按人存，见 shared/conversations 的 ThreadPreference）。 */
  pinned: boolean
  sortTime: number
}

export function hasBoundResource(item: RequirementItem) {
  return item.bound_resource_id != null
}
/** 状态文案走全站统一口径；`deposit_paid` 一码两义，拿到支付模式就传进去（见 `requirementStatusLabel`）。 */
export function formatRequirementStatus(
  status: RequirementStatus,
  paymentMode?: RequirementPaymentMode,
) {
  return requirementStatusLabel(status, paymentMode)
}

/** 需求状态归成四档色调：待用户动手 / 进行中 / 已结单 / 已关闭。
 *  未列出的状态（pending_review、pending_deposit、rejected… 里未单列的）都归「待处理」。 */
export function threadToneOf(status?: string): ThreadTone {
  switch (status) {
    case 'completed':
      return 'done'
    case 'cancelled':
    case 'rejected':
      return 'closed'
    case 'deposit_paid':
    case 'in_development':
    case 'pending_final':
    case 'pending_settlement':
      return 'active'
    default:
      return 'attention'
  }
}

export function formatPaymentMode(item?: RequirementItem) {
  if (!item) {
    return '协作模式待同步'
  }
  return item.payment_mode === 'self_managed' ? '无电签约定' : '电签担保'
}

export function parseTime(value?: string | null) {
  if (!value) {
    return 0
  }
  return parseBackendDateTime(value)?.getTime() ?? 0
}

export function formatMessageTime(value?: string | null) {
  if (!value) {
    return '暂无消息'
  }
  const date = parseBackendDateTime(value)
  if (!date) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isRecent(value?: string | null) {
  const time = parseTime(value)
  if (!time) {
    return false
  }
  return Date.now() - time <= 7 * 24 * 60 * 60 * 1000
}

/** 对方是谁：客户视角看开发者、开发者视角看用户，都不是（管理员之类）就两边一起写。 */
export function partnerLabel(item: RequirementConversation, username: string) {
  if (username === item.customer) {
    return `开发者：${item.developer}`
  }
  if (username === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
}

export function lastMessageLabel(item: RequirementConversation, username: string) {
  if (!item.last_message_at) {
    // 这一格只回答「上一次动静是什么时候」。空会话左边那行预览已经写过「会话已开启，
    // 可以发送第一条消息」，两处各说一遍只是让右侧多出一条更长的句子。
    return '暂无消息'
  }

  // 最后发言只报「我 / 对方 / 系统」：对方的名字已经写在上一行（partnerLabel），
  // 再写一遍账号名不只是重复，还会把右列撑到半行宽。
  const sender =
    item.last_message_by === username ? '我' : item.last_message_by === 'platform' ? '系统' : '对方'
  return `${formatMessageTime(item.last_message_at)} · ${sender}`
}

export function latestMessagePreview(item: RequirementConversation) {
  if (!item.last_message_at) {
    return '会话已开启，可以发送第一条消息。'
  }
  if (item.last_message_attachment_url?.trim()) {
    return '[附件]'
  }

  const content = item.last_message_content?.trim().replace(/\s+/g, ' ')
  return content || '[附件]'
}

/** 已开启的会话 → 列表行。需求数据（标题 / 状态 / 支付模式）缺失时退回会话自身的状态。 */
export function buildConversationThread(
  item: RequirementConversation,
  context: { requirementById: Record<string, RequirementItem>; username: string },
  pinned = false,
): MessageThread {
  if (item.scene === 'resource') {
    return buildResourceConversationThread(item, context.username)
  }

  const requirement = context.requirementById[item.requirement_id]
  const statusLabel = requirement
    ? formatRequirementStatus(requirement.status, requirement.payment_mode)
    : item.status === 'open'
      ? '沟通中'
      : '已关闭'
  const tone: ThreadTone = requirement
    ? threadToneOf(requirement.status)
    : item.status === 'open'
      ? 'active'
      : 'closed'
  const modeLabel = formatPaymentMode(requirement)
  return {
    key: `conversation-${item.conversation_id}`,
    kind: 'conversation',
    scene: 'requirement',
    requirementId: item.requirement_id,
    conversationId: item.conversation_id,
    selectionKey: `requirement:${item.requirement_id}`,
    title: item.requirement_title || requirement?.title || item.requirement_id,
    statusLabel,
    tone,
    modeLabel,
    metaLabel: `${item.requirement_id} · ${modeLabel}`,
    partnerLabel: partnerLabel(item, context.username),
    lastLabel: lastMessageLabel(item, context.username),
    description: latestMessagePreview(item),
    actionLabel: item.last_message_at ? '查看沟通' : '开始沟通',
    unreadCount: item.unread_count ?? 0,
    pinned,
    sortTime: parseTime(item.last_message_at ?? item.updated_at ?? item.created_at),
  }
}

/**
 * 插件咨询会话 → 列表行。
 *
 * 会话本身没有需求状态，列表按「沟通中 / 已关闭」两档展示；对方称谓换成作者 / 买家。
 */
export function buildResourceConversationThread(
  item: RequirementConversation,
  username: string,
): MessageThread {
  const isOpen = item.status === 'open'
  return {
    key: `resource-conversation-${item.conversation_id}`,
    kind: 'resource',
    scene: 'resource',
    requirementId: '',
    conversationId: item.conversation_id,
    resourceId: item.resource_id ?? undefined,
    selectionKey: `conversation:${item.conversation_id}`,
    title: item.requirement_title || `插件 #${item.resource_id ?? ''}`,
    statusLabel: isOpen ? '沟通中' : '已关闭',
    tone: isOpen ? 'active' : 'closed',
    modeLabel: '插件咨询',
    metaLabel: `插件咨询 · #${item.resource_id ?? '-'}`,
    partnerLabel:
      username === item.customer ? `作者：${item.developer}` : `买家：${item.customer}`,
    lastLabel: lastMessageLabel(item, username),
    description: latestMessagePreview(item),
    actionLabel: item.last_message_at ? '查看沟通' : '联系作者',
    unreadCount: item.unread_count ?? 0,
    pinned: false,
    sortTime: parseTime(item.last_message_at ?? item.updated_at ?? item.created_at),
  }
}

/** 已接取但本地还没拿到会话记录的需求 → 「会话待开启」行，打开后会自动同步。 */
export function buildPendingThread(item: RequirementItem, pinned = false): MessageThread {
  const modeLabel = formatPaymentMode(item)
  return {
    key: `pending-${item.requirement_id}`,
    kind: 'pending',
    scene: 'requirement',
    requirementId: item.requirement_id,
    selectionKey: `requirement:${item.requirement_id}`,
    title: item.title,
    statusLabel: formatRequirementStatus(item.status, item.payment_mode),
    tone: threadToneOf(item.status),
    modeLabel,
    metaLabel: `${item.requirement_id} · ${modeLabel}`,
    partnerLabel: '会话待开启',
    lastLabel: '打开后创建沟通会话',
    description: '需求已接取但本地尚未拿到会话记录，打开后会自动同步。',
    actionLabel: '开启会话',
    unreadCount: 0,
    pinned,
    sortTime: parseTime(item.created_time),
  }
}

/** 空态标题：先看关键词，再看筛选档，都没命中才算「暂无消息」。 */
export function messagesEmptyTitle(keyword: string, filter: MessageFilter) {
  if (keyword.trim()) {
    return '没有匹配的会话'
  }
  if (filter === 'active') {
    return '还没有已开启的会话'
  }
  if (filter === 'pending') {
    return '没有待开启的会话'
  }
  return '暂无消息'
}

/** 开发者侧行内状态胶囊：取统一层的配色档（待处理=金、进行中=蓝、已结清=青、已关闭=中性灰） */
export function toneChipClass(tone: ThreadTone) {
  if (tone === 'attention') {
    return 'dev-chip--warm'
  }
  if (tone === 'done') {
    return 'dev-chip--cyan'
  }
  if (tone === 'closed') {
    return 'dev-chip--muted'
  }
  return ''
}

/** 用户工作台侧的行内状态徽标（.wb-badge）：与上面的 dev-chip 档位一一对应，浅底 + 深字 */
export function toneBadgeClass(tone: ThreadTone) {
  if (tone === 'attention') {
    return 'wb-badge wb-badge--warning'
  }
  if (tone === 'done') {
    return 'wb-badge wb-badge--success'
  }
  if (tone === 'closed') {
    return 'wb-badge'
  }
  return 'wb-badge wb-badge--accent'
}
