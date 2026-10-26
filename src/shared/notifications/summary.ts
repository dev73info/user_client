import type { NotificationCard, NotificationKind } from './types'

/** 各类别的条数：读数条与筛选胶囊的计数都取这里，避免两处各算一遍。 */
export function countByKind(cards: NotificationCard[]): Record<NotificationKind, number> {
  return {
    'history-disclosure': cards.filter((card) => card.kind === 'history-disclosure').length,
    'after-sales': cards.filter((card) => card.kind === 'after-sales').length,
    'comment-warning': cards.filter((card) => card.kind === 'comment-warning').length,
  }
}

/** 还在等我投票的公开申请数。 */
export function pendingVoteCount(cards: NotificationCard[]): number {
  return cards.filter((card) => card.kind === 'history-disclosure' && card.canVote).length
}

/** 还在等我动手的通知数：公开申请里轮到我投的那一票，读数条「待我处理」用。 */
export function pendingActionCount(cards: NotificationCard[]): number {
  return cards.filter((card) => card.canVote).length
}

/**
 * 类别筛选 + 关键字搜索。
 *
 * 搜索覆盖标题、正文与弱信息行：用户记得的多半是「哪条需求」「正文里提过的某个词」，
 * 只搜标题会让「在正文里提过但你忘了标题」的通知搜不到。
 */
export function filterNotificationCards(
  cards: NotificationCard[],
  kind: NotificationKind | 'all',
  keyword: string,
): NotificationCard[] {
  const search = keyword.trim().toLocaleLowerCase()
  return cards.filter((card) => {
    if (kind !== 'all' && card.kind !== kind) {
      return false
    }
    if (!search) {
      return true
    }
    return [card.title, card.kindLabel, card.meta, ...card.body]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search)
  })
}
