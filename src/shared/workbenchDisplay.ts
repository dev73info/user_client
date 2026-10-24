import type { RequirementConversation } from '@/api/conversations'

/**
 * 工作台外壳的展示层纯函数：会话行的对方称呼、时间文案、未读角标读数与排序。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来，供外壳、消息中心那一组与会话行共用；
 * 只做「值 → 显示串」的映射，不读 store、不发请求，便于单测。
 */

/** 会话的「最近动静」时间戳：最后一条消息 → 最近更新 → 创建时间，依次兜底。 */
export function conversationTimestamp(item: RequirementConversation): number {
  return parseConversationTime(item.last_message_at ?? item.updated_at ?? item.created_at)
}

/** 时间串转毫秒；空值与非法的日期一律当 0（排在最后，而不是崩在排序里）。 */
export function parseConversationTime(value?: string | null): number {
  if (!value) {
    return 0
  }
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

/** 「8/21 14:05」这一档：按月日 + 时分显示，跨年不显示年份（与拆分前同口径）。 */
export function formatConversationTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚更新'
  }

  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 会话行第二行的后半段：「最近 8/21 14:05」；没有消息时直说没有。 */
export function conversationMeta(item: RequirementConversation): string {
  if (!item.last_message_at) {
    return '暂无消息'
  }

  return `最近 ${formatConversationTime(item.last_message_at)}`
}

/** 会话行第二行的前半段：按「我在这一单里是哪一方」改称谓，都不是就并列两方账号。 */
export function partnerLabel(item: RequirementConversation, username: string): string {
  if (username === item.customer) {
    return `开发者：${item.developer}`
  }
  if (username === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
}

/** 角标读数：超过 99 收成 99+，免得把菜单标题挤走（未读总数与会话行里的未读小标共用）。 */
export function unreadCountText(count: number): string {
  return count > 99 ? '99+' : String(count)
}

/** 消息中心角标：各会话的未读数求和（后端按「最后已读位置」现算，0 也算一条）。 */
export function countUnreadMessages(conversations: RequirementConversation[]): number {
  return conversations.reduce((total, item) => total + (item.unread_count ?? 0), 0)
}

/** 最近动静在前；时间相同则保持后端返回的原顺序（`sort` 是稳定排序）。 */
export function sortConversationsByRecency(
  conversations: RequirementConversation[],
): RequirementConversation[] {
  return [...conversations].sort(
    (left, right) => conversationTimestamp(right) - conversationTimestamp(left),
  )
}
