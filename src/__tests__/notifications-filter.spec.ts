/** 通知的类别筛选、关键字搜索与读数 / 胶囊计数。 */
import { describe, expect, it } from 'vitest'

import {
  buildNotificationCards,
  countByKind,
  filterNotificationCards,
  pendingActionCount,
  pendingVoteCount,
} from '@/shared/notifications'
import {
  afterSalesCase,
  disclosure,
  keys,
  kinds,
  post,
  transfer,
  warning,
} from './helpers/notifications'

describe('notification filtering and counts', () => {
  const cards = buildNotificationCards({
    warnings: [warning()],
    announcements: [post()],
    disclosures: [disclosure()],
    afterSales: [afterSalesCase()],
    transferInbox: [transfer()],
    username: 'dev_old',
  })

  it('类别筛选与关键字搜索覆盖标题、正文与弱信息行', () => {
    expect(kinds(filterNotificationCards(cards, 'announcement', ''))).toEqual(['announcement'])
    expect(kinds(filterNotificationCards(cards, 'all', ''))).toEqual(kinds(cards))
    // 搜正文里的词：用户记得的多半是「公告里提过什么」，只搜标题会搜不到
    expect(keys(filterNotificationCards(cards, 'all', '维护'))).toEqual(['announcement-7'])
    // 搜弱信息行（操作人）
    expect(keys(filterNotificationCards(cards, 'all', 'admin'))).toContain('comment-warning-1')
    // 类别与关键字同时生效
    expect(filterNotificationCards(cards, 'comment-warning', '维护')).toEqual([])
    // 大小写不敏感 + 首尾空格不影响结果
    expect(keys(filterNotificationCards(cards, 'all', '  ADMIN  '))).toContain('comment-warning-1')
  })

  it('读数条与筛选胶囊的计数取自同一处', () => {
    expect(countByKind(cards)).toEqual({
      'comment-warning': 1,
      'history-disclosure': 1,
      'resource-transfer': 1,
      'after-sales': 1,
      announcement: 1,
    })
    // 还在等我投票的公开申请
    expect(pendingVoteCount(cards)).toBe(1)
    expect(
      pendingVoteCount(
        buildNotificationCards({ disclosures: [disclosure()], username: 'dev_new' }),
      ),
    ).toBe(0)
    // 「待我处理」= 等我投的一票 + 等我同意的过户
    expect(pendingActionCount(cards)).toBe(2)
  })
})
