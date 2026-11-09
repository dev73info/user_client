/** 争议案件卡与 dispute_* 收件箱卡的合并：一案一条、主体保留本地卡、meta 补最新事件。 */
import { describe, expect, it } from 'vitest'

import { buildNotificationCards } from '@/shared/notifications'
import { afterSalesCase, inboxItem } from './helpers/notifications'

describe('争议案件合并', () => {
  it('主体保留本地案件卡，meta 补最新事件（乱序输入按时间判定）', () => {
    const cards = buildNotificationCards({
      afterSales: [afterSalesCase()],
      // 故意乱序：最新事件不靠数组顺序判定
      inbox: [
        inboxItem({
          notification_id: 'NTF-D2',
          kind: 'breach',
          event: 'dispute_escalated',
          title: '平台已介入争议处理',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: false,
          created_time: '2026-04-02 10:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-D4',
          kind: 'breach',
          event: 'dispute_closed',
          title: '争议已结案',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: true,
          created_time: '2026-04-05 10:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-D1',
          kind: 'breach',
          event: 'dispute_case_filed',
          title: '争议已立案',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: true,
          created_time: '2026-04-01 09:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-D3',
          kind: 'breach',
          event: 'dispute_decided',
          title: '争议已裁决',
          link: '/workbench/requirements/REQ-1',
          biz_no: 'REQ-1',
          read: true,
          created_time: '2026-04-03 10:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]?.key).toBe('after-sales-AFTERSALES_1_abc')
    expect(cards[0]?.kindLabel).toBe('争议')
    // 主体仍是本地案件卡
    expect(cards[0]?.title).toBe('REQ-1')
    expect(cards[0]?.body).toEqual([
      'AFTERSALES_1_abc · 售后争议',
      '诉求：主张金额 10 元 · 当前状态：平台裁决中',
    ])
    // meta 追加最新事件（按时间判定）；本地立案时间与发起人保留
    expect(cards[0]?.meta).toBe(
      '2026-04-01T09:00:00+08:00 由 cust 发起 · 最新：争议已结案（2026-04-05 10:00:00）',
    )
    expect(cards[0]?.createdAt).toBe('2026-04-01T09:00:00+08:00')
    // 四个阶段的单号都收进来，点一次「标为已读」能一起标掉
    expect(cards[0]?.notificationIds).toEqual(['NTF-D2', 'NTF-D4', 'NTF-D1', 'NTF-D3'])
    // 只要还有一条未读，整张卡保持未读，可标记单号指向那条未读的
    expect(cards[0]?.read).toBe(false)
    expect(cards[0]?.notificationId).toBe('NTF-D2')
    // 本地卡没有链接，合并后取最新事件的跳转
    expect(cards[0]?.link).toBe('/workbench/messages?requirement_id=REQ-1')
  })

  it('最新事件标题与卡片已有文案重复时不重复追加', () => {
    const cards = buildNotificationCards({
      afterSales: [afterSalesCase()],
      inbox: [
        inboxItem({
          notification_id: 'NTF-D1',
          kind: 'breach',
          event: 'dispute_escalated',
          // 与本地卡的「当前状态：平台裁决中」重复
          title: '平台裁决中',
          biz_no: 'REQ-1',
          read: true,
          created_time: '2026-04-02 10:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]?.meta).toBe('2026-04-01T09:00:00+08:00 由 cust 发起')
  })

  it('只有收件箱时，同一案件的 dispute_* 事件也只留最新一条', () => {
    const cards = buildNotificationCards({
      inbox: [
        inboxItem({
          notification_id: 'NTF-D3',
          kind: 'breach',
          event: 'dispute_decided',
          title: '争议已裁决',
          biz_no: 'REQ-1',
          read: true,
          created_time: '2026-04-03 10:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-D2',
          kind: 'breach',
          event: 'dispute_escalated',
          title: '平台已介入争议处理',
          biz_no: 'REQ-1',
          read: false,
          created_time: '2026-04-02 10:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]?.key).toBe('notification-NTF-D3')
    expect(cards[0]?.title).toBe('争议已裁决')
    expect(cards[0]?.notificationIds).toEqual(['NTF-D3', 'NTF-D2'])
    expect(cards[0]?.read).toBe(false)
    expect(cards[0]?.notificationId).toBe('NTF-D2')
  })
})
