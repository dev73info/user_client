import type { NotificationCard } from './types'

/**
 * 通知去重。
 *
 * 两层：
 * 1. **按 id**：卡片 key 唯一。收件箱的 key 是后端通知单号，翻页重叠或重复请求时只留一条；
 * 2. **按分组键**：本地来源与收件箱描述同一件事时合并成一条。分组键分两种粒度：
 *    - `dispute:` 是案件级：同一案件的立案 / 介入 / 裁决 / 结案与本地案件卡合并成一条，
 *      不看时间先后（案件卡展示当前状态）；
 *    - 其余（评论警告、资源、帖子）是事件级：分组键相同且创建时间在 ±60 秒内才算同一条。
 *      本地记录时间与通知入库时间可能跨秒，精确到秒会把同一条警告显示两遍；
 *      不同时间（超出容差）的两次事件各留一条。
 *
 * 合并时保留先出现的卡片（本地卡字段更全），把后一条的已读态、跳转、通知单号并过去；
 * 案件级合并还会收集全部通知单号，点一次「标为已读」把这一案件的未读事件一起标掉。
 */

/** 事件级分组的匹配容差：同一事件的两次写入不在同一秒，留一分钟余量。 */
const GROUP_WINDOW_MS = 60_000

export function dedupeNotificationCards(cards: NotificationCard[]): NotificationCard[] {
  const seenKeys = new Set<string>()
  const seenGroups = new Map<string, NotificationCard[]>()
  const result: NotificationCard[] = []

  for (const card of cards) {
    if (seenKeys.has(card.key)) {
      continue
    }
    seenKeys.add(card.key)

    if (!card.groupKey) {
      result.push(card)
      continue
    }

    const bucket = seenGroups.get(card.groupKey) ?? []
    const existing = bucket.find((candidate) => sameGroup(card, candidate))
    if (existing) {
      mergeNotificationCard(existing, card)
      continue
    }

    bucket.push(card)
    seenGroups.set(card.groupKey, bucket)
    result.push(card)
  }

  return result
}

/** 同一分组：`dispute:` 只看组键；其余还要卡在同一时间窗内。 */
function sameGroup(left: NotificationCard, right: NotificationCard): boolean {
  if (!left.groupKey || left.groupKey !== right.groupKey) {
    return false
  }
  if (left.groupKey.startsWith('dispute:')) {
    return true
  }
  return Math.abs(left.sortTime - right.sortTime) <= GROUP_WINDOW_MS
}

/** 把被合并掉那条的「可操作字段」补到保留的卡片上（本地卡默认没有这些）。 */
function mergeNotificationCard(target: NotificationCard, source: NotificationCard): void {
  collectNotificationIds(target, source)

  if (target.groupKey?.startsWith('dispute:')) {
    // 卡片主体保持本地案件卡；只把「最新事件」补进时间行，跳转也取最新事件的。
    adoptLatestDisputeEvent(target, source)
    // 案件里只要还有一条没读，整张卡就保持未读；可标记的单号指向那条未读的。
    if (source.read === false && target.read !== false) {
      target.read = false
      target.notificationId = source.notificationId ?? target.notificationId
    }
  } else {
    target.read ??= source.read
  }

  target.notificationId ??= source.notificationId
  target.link ??= source.link
  target.event ??= source.event
}

/**
 * 案件级合并：在时间行追加最新一条后端争议事件（标题与时间）。
 *
 * 只认 `dispute_*` 的收件箱卡；按 sortTime 比较而不是数组顺序。标题 / 正文 / 排序时间
 * 保持本地案件卡不变。最新事件的标题已经出现在卡片文案里时不重复展示。
 */
function adoptLatestDisputeEvent(target: NotificationCard, source: NotificationCard): void {
  if (source.source !== 'inbox' || !source.event?.startsWith('dispute_')) {
    return
  }
  if (source.sortTime <= (target.latestEventTime ?? Number.NEGATIVE_INFINITY)) {
    return
  }

  target.latestEventTime = source.sortTime
  if (source.link) {
    target.link = source.link
  }

  const baseMeta = target.baseMeta ?? target.meta
  target.baseMeta = baseMeta

  const eventTitle = source.title.trim()
  if (!eventTitle || isMentioned(target, eventTitle)) {
    target.meta = baseMeta
    return
  }
  target.meta = `${baseMeta} · 最新：${eventTitle}（${source.createdAt}）`
}

/** 事件标题是否已经在卡片现有文案里出现过（标题 / 状态 / 时间行 / 正文）。 */
function isMentioned(card: NotificationCard, text: string): boolean {
  return [card.title, card.caseStatus, card.baseMeta ?? card.meta, ...card.body].some(
    (value) => Boolean(value) && value!.includes(text),
  )
}

/** 收集合并进同一张卡的全部通知单号（一张卡可能对应同一案件的多次事件）。 */
function collectNotificationIds(target: NotificationCard, source: NotificationCard): void {
  const ids = target.notificationIds ?? (target.notificationId ? [target.notificationId] : [])
  const incoming = source.notificationIds ?? (source.notificationId ? [source.notificationId] : [])
  for (const id of incoming) {
    if (!ids.includes(id)) {
      ids.push(id)
    }
  }
  target.notificationIds = ids.length > 0 ? ids : undefined
}
