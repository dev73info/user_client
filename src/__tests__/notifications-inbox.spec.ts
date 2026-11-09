/** 后端收件箱：kind / event 映射、去重、筛选、跳转，以及「一次取全」的翻页。 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listAllMyNotifications, type BackendNotification } from '@/api/notifications'
import {
  backendKindLabel,
  buildNotificationCards,
  filterNotificationCards,
  notificationEventIconKey,
  notificationEventLabel,
  notificationKindOf,
  resolveNotificationLink,
} from '@/shared/notifications'
import { commentWarning, keys, kinds } from './helpers/notifications'

function inboxItem(overrides: Partial<BackendNotification> = {}): BackendNotification {
  return {
    notification_id: 'NTF-1',
    recipient: 'cust',
    kind: 'requirement',
    event: 'requirement_delivered',
    title: '开发者已提交交付',
    body: '需求 REQ-1 已提交交付，请在验收期内确认。',
    link: '/workbench/requirements/REQ-1',
    biz_no: 'REQ-1',
    read: false,
    email_sent: true,
    created_time: '2026-11-08 10:00:00',
    read_time: null,
    ...overrides,
  }
}

describe('收件箱 kind / event 映射', () => {
  it('四个后端 kind 归到三个筛选桶：争议按需求看', () => {
    expect(notificationKindOf('requirement')).toBe('requirement')
    expect(notificationKindOf('breach')).toBe('requirement')
    expect(notificationKindOf('payment')).toBe('payment')
    expect(notificationKindOf('system')).toBe('system')
    // 未知 kind 不藏起来，按系统处理
    expect(notificationKindOf('whatever')).toBe('system')

    expect(backendKindLabel('breach')).toBe('争议')
    expect(backendKindLabel('payment')).toBe('资金')
  })

  it('事件徽标与图标按前缀分组，未登记时按 kind 兜底', () => {
    expect(notificationEventLabel('dispute_decided')).toBe('争议')
    expect(notificationEventLabel('invoice_approved')).toBe('发票')
    expect(notificationEventLabel('refund_succeeded')).toBe('退款')
    expect(notificationEventLabel('withdrawal_paid')).toBe('提现')
    expect(notificationEventLabel('comment_warned')).toBe('评论警告')
    expect(notificationEventLabel('resource_published')).toBe('资源')
    expect(notificationEventLabel('ticket_staff_reply')).toBe('工单')
    expect(notificationEventLabel('something_new')).toBeNull()

    expect(notificationEventIconKey('dispute_case_filed', 'requirement')).toBe('dispute')
    expect(notificationEventIconKey('invoice_rejected', 'payment')).toBe('invoice')
    expect(notificationEventIconKey('refund_failed', 'payment')).toBe('refund')
    expect(notificationEventIconKey('deposit_paid', 'payment')).toBe('payment')
    expect(notificationEventIconKey('community_post_approved', 'system')).toBe('community')
    expect(notificationEventIconKey('unknown_event', 'payment')).toBe('payment')
  })

  it('后端链接改写到用户端真实路由；需求落消息中心会话', () => {
    expect(resolveNotificationLink('/workbench/requirements/REQ-1', false)).toBe(
      '/workbench/messages?requirement_id=REQ-1',
    )
    expect(resolveNotificationLink('/requirements/REQ-1', true)).toBe(
      '/workbench/developer/messages?requirement_id=REQ-1',
    )
    expect(resolveNotificationLink('/workbench/invoices', false)).toBe('/workbench/invoices')
    expect(resolveNotificationLink('/workbench/invoices', true)).toBe(
      '/workbench/developer/invoices',
    )
    expect(resolveNotificationLink('/wallet', true)).toBe('/workbench/developer/wallet/overview')
    expect(resolveNotificationLink('/wallet', false)).toBe('/workbench')
    expect(resolveNotificationLink('/contracts/9', false)).toBe('/workbench/signatures/9')
    expect(resolveNotificationLink('/community/posts/7', false)).toBe('/community/posts/7')
    expect(resolveNotificationLink('/workbench/resource-purchases/transfers', false)).toBe(
      '/workbench/purchase-transfers',
    )
    // 通知中心自己的链接与认不出的地址不给跳转
    expect(resolveNotificationLink('/workbench/notifications', false)).toBeUndefined()
    expect(resolveNotificationLink('javascript:alert(1)', false)).toBeUndefined()
    expect(resolveNotificationLink('', false)).toBeUndefined()
  })
})

describe('收件箱卡片', () => {
  it('标题 / 正文取后端文案，kind 与徽标按事件归类', () => {
    const cards = buildNotificationCards({
      inbox: [
        inboxItem({
          notification_id: 'NTF-B',
          kind: 'breach',
          event: 'dispute_decided',
          title: '争议已裁决',
          body: '需求 REQ-1 的争议已有裁决。',
          created_time: '2026-11-09 09:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(keys(cards)).toEqual(['notification-NTF-B'])
    expect(cards[0]?.kind).toBe('requirement')
    expect(cards[0]?.source).toBe('inbox')
    expect(cards[0]?.kindLabel).toBe('争议')
    expect(cards[0]?.title).toBe('争议已裁决')
    expect(cards[0]?.body).toEqual(['需求 REQ-1 的争议已有裁决。'])
    expect(cards[0]?.read).toBe(false)
    expect(cards[0]?.link).toBe('/workbench/messages?requirement_id=REQ-1')
  })

  it('按通知单号去重，再按时间倒序', () => {
    const cards = buildNotificationCards({
      inbox: [
        inboxItem({ notification_id: 'NTF-1', created_time: '2026-11-08 10:00:00' }),
        inboxItem({ notification_id: 'NTF-2', created_time: '2026-11-09 10:00:00' }),
        inboxItem({ notification_id: 'NTF-1', created_time: '2026-11-08 10:00:00' }),
      ],
      username: 'cust',
    })
    expect(keys(cards)).toEqual(['notification-NTF-2', 'notification-NTF-1'])
  })

  it('评论警告与后端通知是同一事件时合并：保留本地快照，并把已读态并过去', () => {
    const cards = buildNotificationCards({
      commentWarnings: [commentWarning()],
      inbox: [
        inboxItem({
          notification_id: 'NTF-C',
          kind: 'system',
          event: 'comment_warned',
          title: '评论违规警告',
          body: '你的评论被平台警告：包含广告联系方式。',
          link: '/community',
          biz_no: 'comment:community-5',
          read: false,
          created_time: '2026-05-01 10:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(cards).toHaveLength(1)
    expect(cards[0]?.key).toBe('comment-warning-2')
    expect(cards[0]?.body).toEqual([
      '评论快照：含有联系方式的测试评论',
      '警告原因：包含广告联系方式',
    ])
    // 本地卡没有已读字段，合并后拿到后端那条的状态
    expect(cards[0]?.notificationId).toBe('NTF-C')
    expect(cards[0]?.read).toBe(false)
    expect(cards[0]?.link).toBe('/community')
  })

  it('分组键相同但时间不同视为两次事件，各留一条', () => {
    const cards = buildNotificationCards({
      commentWarnings: [commentWarning()],
      inbox: [
        inboxItem({
          notification_id: 'NTF-C',
          kind: 'system',
          event: 'comment_warned',
          biz_no: 'comment:community-5',
          created_time: '2026-06-01 10:00:00',
        }),
      ],
      username: 'cust',
    })
    expect(cards).toHaveLength(2)
  })
})

describe('收件箱参与筛选', () => {
  it('需求 / 资金 / 系统三个桶都能命中后端通知', () => {
    const cards = buildNotificationCards({
      inbox: [
        inboxItem({ notification_id: 'NTF-R', kind: 'requirement' }),
        inboxItem({
          notification_id: 'NTF-P',
          kind: 'payment',
          event: 'deposit_paid',
          title: '定金已到账',
          created_time: '2026-11-07 10:00:00',
        }),
        inboxItem({
          notification_id: 'NTF-S',
          kind: 'system',
          event: 'resource_published',
          title: '资源已上架',
          created_time: '2026-11-06 10:00:00',
        }),
      ],
      username: 'cust',
    })

    expect(kinds(cards)).toEqual(['requirement', 'payment', 'system'])
    expect(keys(filterNotificationCards(cards, 'payment', ''))).toEqual(['notification-NTF-P'])
    expect(keys(filterNotificationCards(cards, 'system', '资源'))).toEqual(['notification-NTF-S'])
  })
})

describe('listAllMyNotifications', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('按 total 翻完所有页，返回合并后的列表与后端未读数', async () => {
    const page = (items: BackendNotification[], pageNo: number) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            items,
            total: 3,
            page: pageNo,
            page_size: 100,
            unread_count: 1,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    fetchMock.mockImplementation((url: string) => {
      return String(url).includes('page=2')
        ? page([inboxItem({ notification_id: 'NTF-3' })], 2)
        : page(
            [inboxItem({ notification_id: 'NTF-1' }), inboxItem({ notification_id: 'NTF-2' })],
            1,
          )
    })

    const result = await listAllMyNotifications('token')

    expect(result.items.map((item) => item.notification_id)).toEqual(['NTF-1', 'NTF-2', 'NTF-3'])
    expect(result.unread_count).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(firstUrl).toContain('/api/notification?')
    expect(firstUrl).toContain('page=1')
    expect(firstUrl).toContain('page_size=100')
  })
})
