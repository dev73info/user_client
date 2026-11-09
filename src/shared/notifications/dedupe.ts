import type { NotificationCard } from './types'

/**
 * 通知去重。
 *
 * 两层：
 * 1. **按 id**：卡片 key 唯一。收件箱的 key 是后端通知单号，翻页重叠或重复请求时只留一条；
 * 2. **按分组键 + 时间**：本地来源与收件箱描述同一条业务通知时（典型是评论警告：
 *    本地有快照与原因，收件箱有已读态与跳转），合并成一条。
 *
 * 合并时保留先出现的卡片（本地卡字段更全），把后一条的已读态、跳转、通知单号并过去；
 * 分组键相同但时间不同视为两次事件，各留一条。
 */
export function dedupeNotificationCards(cards: NotificationCard[]): NotificationCard[] {
  const seenKeys = new Set<string>()
  const seenGroups = new Map<string, NotificationCard>()
  const result: NotificationCard[] = []

  for (const card of cards) {
    if (seenKeys.has(card.key)) {
      continue
    }
    seenKeys.add(card.key)

    const groupKey = card.groupKey ? `${card.groupKey}|${card.createdAt}` : ''
    const existing = groupKey ? seenGroups.get(groupKey) : undefined
    if (existing) {
      mergeNotificationCard(existing, card)
      continue
    }

    if (groupKey) {
      seenGroups.set(groupKey, card)
    }
    result.push(card)
  }

  return result
}

/** 把被合并掉那条的「可操作字段」补到保留的卡片上（本地卡默认没有这些）。 */
function mergeNotificationCard(target: NotificationCard, source: NotificationCard): void {
  target.notificationId ??= source.notificationId
  target.read ??= source.read
  target.link ??= source.link
  target.event ??= source.event
}
