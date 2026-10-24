/** 两类来源合成通知列表：排序、跨类别唯一键、各类卡片的标题 / 正文 / 弱信息行。 */
import { describe, expect, it } from 'vitest'

import { buildNotificationCards, parseNoticeTime } from '@/shared/notifications'
import { afterSalesCase, disclosure, kinds, keys } from './helpers/notifications'

describe('system notification aggregation', () => {
  it('两类来源合成一张列表并按时间倒序', () => {
    const cards = buildNotificationCards({
      disclosures: [disclosure()],
      afterSales: [afterSalesCase()],
      username: 'dev_old',
    })

    // 两类时间格式不一样（公开申请与解除合作案件带时区），聚合层统一解析后再排序：四月 → 三月
    expect(kinds(cards)).toEqual(['after-sales', 'history-disclosure'])
    // 跨类别唯一的键：公开申请用自增 id，解除合作案件用业务号 `case_no`，不会撞
    expect(keys(cards)).toEqual(['after-sales-AFTERSALES_1_abc', 'history-disclosure-3'])
    expect(cards[0]?.kindLabel).toBe('解除合作案件')
    expect(cards[1]?.kindLabel).toBe('公开申请')
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
