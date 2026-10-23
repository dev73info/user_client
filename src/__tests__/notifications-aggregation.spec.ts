/** 四类来源合成通知列表：排序、跨类别唯一键、各类卡片的标题 / 正文 / 弱信息行。 */
import { describe, expect, it } from 'vitest'

import {
  announcementPreview,
  buildNotificationCards,
  parseNoticeTime,
} from '@/shared/notifications'
import { afterSalesCase, disclosure, kinds, keys, post, warning } from './helpers/notifications'

describe('system notification aggregation', () => {
  it('四类来源合成一张列表并按时间倒序', () => {
    const cards = buildNotificationCards({
      warnings: [warning()],
      announcements: [post()],
      disclosures: [disclosure()],
      afterSales: [afterSalesCase()],
      username: 'dev_old',
    })

    // 四类时间格式不一样（公告与警告是后端口径的 `YYYY-MM-DD HH:MM:SS`，公开申请与解除合作案件带时区），
    // 聚合层统一解析后再排序：四月 → 三月 → 二月 → 一月
    expect(kinds(cards)).toEqual([
      'after-sales',
      'history-disclosure',
      'announcement',
      'comment-warning',
    ])
    // 跨类别唯一的键：四类 id 都从 1 开始，只拼 id 会撞在一起
    expect(keys(cards)).toEqual([
      'after-sales-5',
      'history-disclosure-3',
      'announcement-7',
      'comment-warning-1',
    ])
    expect(cards[0]?.kindLabel).toBe('解除合作案件')
    expect(cards[1]?.kindLabel).toBe('公开申请')
    expect(cards[2]?.kindLabel).toBe('平台公告')
    expect(cards[3]?.kindLabel).toBe('评论警告')
  })

  it('解除合作案件卡片只读：标题取需求名，正文写清诉求额度与当前状态', () => {
    const [card] = buildNotificationCards({ afterSales: [afterSalesCase()], username: 'cust' })

    expect(card?.title).toBe('企业官网改版')
    expect(card?.body).toEqual([
      'AFTERSALES_1_abc · 需求 REQ-1',
      '诉求：要钱（主张金额 10.00 元） · 当前状态：平台裁决中',
    ])
    expect(card?.meta).toBe('2026-04-01T09:00:00+08:00 由 cust 发起')
    // 发起、表态、撤回都在需求列表的解除合作弹窗里做，通知卡片不带动作
    expect(card?.canVote).toBe(false)
    expect(card?.postId).toBeUndefined()
  })

  it('解除合作案件没有主张金额时不显示额度括号', () => {
    const [card] = buildNotificationCards({
      afterSales: [afterSalesCase({ expectsMoney: false, expectsRework: true, claimAmountFen: 0 })],
      username: 'cust',
    })
    expect(card?.body[1]).toBe('诉求：要返工 · 当前状态：平台裁决中')
  })

  it('时间解析不出来时排在最后——格式异常的旧通知不该被顶到最上面', () => {
    const cards = buildNotificationCards({
      warnings: [warning({ id: 9, created_at: '不是时间' }), warning({ id: 1 })],
      username: 'cust',
    })

    expect(keys(cards)).toEqual(['comment-warning-1', 'comment-warning-9'])
    expect(parseNoticeTime('2026-01-02 10:00:00')).toBeGreaterThan(0)
    expect(parseNoticeTime('')).toBe(0)
    expect(parseNoticeTime(null)).toBe(0)
  })

  it('评论警告卡片带原评论快照与原因两行，公告卡片带要跳的帖子 id', () => {
    const [warningCard] = buildNotificationCards({ warnings: [warning()], username: 'cust' })
    expect(warningCard?.title).toBe('社区评论被平台警告')
    expect(warningCard?.body).toEqual(['原评论：这条评论被删了', '警告原因：包含广告信息'])
    expect(warningCard?.postId).toBeUndefined()
    expect(warningCard?.canVote).toBe(false)

    const [resourceWarning] = buildNotificationCards({
      warnings: [warning({ comment_type: 'resource' })],
      username: 'cust',
    })
    expect(resourceWarning?.title).toBe('资源评论被平台警告')

    const [announcement] = buildNotificationCards({ announcements: [post()], username: 'cust' })
    expect(announcement?.postId).toBe(7)
    expect(announcement?.title).toBe('平台维护公告')
    expect(announcement?.meta).toBe('2026-02-01 12:00:00 发布')
  })

  it('公告摘要先净化再剥标签并截断', () => {
    expect(announcementPreview('<p>本周凌晨<strong>维护</strong></p>')).toBe('本周凌晨维护')
    expect(announcementPreview('<p>   </p>')).toBe('点击查看公告全文。')
    expect(announcementPreview('<p>abc</p>', 2)).toBe('ab…')
  })
})
