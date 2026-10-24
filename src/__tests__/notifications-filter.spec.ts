/** 通知的类别筛选、关键字搜索与读数 / 胶囊计数。 */
import { describe, expect, it } from 'vitest'

import {
  buildNotificationCards,
  countByKind,
  filterNotificationCards,
  pendingActionCount,
  pendingVoteCount,
} from '@/shared/notifications'
import { afterSalesCase, disclosure, keys, kinds } from './helpers/notifications'

describe('notification filtering and counts', () => {
  const cards = buildNotificationCards({
    disclosures: [disclosure()],
    afterSales: [afterSalesCase()],
    username: 'dev_old',
  })

  it('类别筛选与关键字搜索覆盖标题、正文与弱信息行', () => {
    expect(kinds(filterNotificationCards(cards, 'after-sales', ''))).toEqual(['after-sales'])
    expect(kinds(filterNotificationCards(cards, 'all', ''))).toEqual(kinds(cards))
    // 搜正文里的词：用户记得的多半是「正文里提过什么」，只搜标题会搜不到
    expect(keys(filterNotificationCards(cards, 'all', '主张金额'))).toEqual([
      'after-sales-AFTERSALES_1_abc',
    ])
    // 搜弱信息行（发起人）
    expect(keys(filterNotificationCards(cards, 'all', 'cust'))).toContain(
      'after-sales-AFTERSALES_1_abc',
    )
    // 类别与关键字同时生效
    expect(filterNotificationCards(cards, 'history-disclosure', '主张金额')).toEqual([])
    // 大小写不敏感 + 首尾空格不影响结果
    expect(keys(filterNotificationCards(cards, 'all', '  CUST  '))).toContain(
      'after-sales-AFTERSALES_1_abc',
    )
  })

  it('读数条与筛选胶囊的计数取自同一处', () => {
    expect(countByKind(cards)).toEqual({
      'history-disclosure': 1,
      'after-sales': 1,
    })
    // 还在等我投票的公开申请
    expect(pendingVoteCount(cards)).toBe(1)
    expect(
      pendingVoteCount(
        buildNotificationCards({ disclosures: [disclosure()], username: 'dev_new' }),
      ),
    ).toBe(0)
    // 「待我处理」= 还在等我投的那一票（资源过户那一类已随能力下线）
    expect(pendingActionCount(cards)).toBe(1)
  })
})
