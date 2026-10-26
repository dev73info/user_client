/** 三类来源合成通知列表：排序、跨类别唯一键、各类卡片的标题 / 正文 / 弱信息行。 */
import { describe, expect, it } from 'vitest'

import { buildNotificationCards, parseNoticeTime } from '@/shared/notifications'
import { afterSalesCase, commentWarning, disclosure, kinds, keys } from './helpers/notifications'

describe('system notification aggregation', () => {
  it('三类来源合成一张列表并按时间倒序', () => {
    const cards = buildNotificationCards({
      disclosures: [disclosure()],
      afterSales: [afterSalesCase()],
      commentWarnings: [commentWarning()],
      username: 'dev_old',
    })

    // 三类时间格式统一在聚合层解析后再排序：五月 → 四月 → 三月
    expect(kinds(cards)).toEqual(['comment-warning', 'after-sales', 'history-disclosure'])
    expect(keys(cards)).toEqual([
      'comment-warning-2',
      'after-sales-AFTERSALES_1_abc',
      'history-disclosure-3',
    ])
    expect(cards[0]?.kindLabel).toBe('评论警告')
    expect(cards[1]?.kindLabel).toBe('解除合作案件')
    expect(cards[2]?.kindLabel).toBe('公开申请')
  })

  it('评论警告卡片直接展示快照、原因和时间，不依赖源评论是否存在', () => {
    const [card] = buildNotificationCards({
      commentWarnings: [commentWarning()],
      username: 'cust',
    })

    expect(card?.title).toBe('评论 #5')
    expect(card?.body).toEqual(['评论快照：含有联系方式的测试评论', '警告原因：包含广告联系方式'])
    expect(card?.meta).toBe('2026-05-01 10:00:00 由 admin 发出警告')
    expect(card?.canVote).toBe(false)
  })

  it('解除合作案件卡片只读：标题取需求编号，正文写清诉求额度与当前状态', () => {
    const [card] = buildNotificationCards({ afterSales: [afterSalesCase()], username: 'cust' })

    // 契约 `CaseSummaryResponse` 只给需求编号，不给需求标题——标题栏就摆编号，不编一个出来
    expect(card?.title).toBe('REQ-1')
    expect(card?.body).toEqual([
      'AFTERSALES_1_abc · 售后争议',
      '诉求：主张金额 10 元 · 当前状态：平台裁决中',
    ])
    expect(card?.meta).toBe('2026-04-01T09:00:00+08:00 由 cust 发起')
    // 发起、表态、撤回都在需求列表的解除合作弹窗里做，通知卡片不带动作
    expect(card?.canVote).toBe(false)
  })

  it('解除合作案件没有主张金额时不显示额度括号', () => {
    const [card] = buildNotificationCards({
      afterSales: [afterSalesCase({ claim_amount_fen: 0 })],
      username: 'cust',
    })
    expect(card?.body[1]).toBe('诉求：不主张资金 · 当前状态：平台裁决中')
  })

  it('时间解析不出来时排在最后——格式异常的旧通知不该被顶到最上面', () => {
    const cards = buildNotificationCards({
      disclosures: [
        disclosure({ id: 9, created_at: '不是时间' }),
        disclosure({ id: 3, created_at: '2026-03-01T09:00:00+08:00' }),
      ],
      username: 'cust',
    })

    expect(keys(cards)).toEqual(['history-disclosure-3', 'history-disclosure-9'])
    expect(parseNoticeTime('2026-01-02 10:00:00')).toBeGreaterThan(0)
    expect(parseNoticeTime('')).toBe(0)
    expect(parseNoticeTime(null)).toBe(0)
  })
})
