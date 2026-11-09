import type { BackendNotification } from '@/api/notifications'

import { currentMockProfile } from '../identity'

/**
 * 站内通知的 mock 数据：每个身份一份，读 / 已读状态在内存里改。
 *
 * 只在没起后端时给界面用（`?mock=1`）。四条覆盖三个筛选类别与已读 / 未读两种状态；
 * 评论警告那条故意用 `comment:` 前缀的 biz_no，和本地来源同构的去重键一样。
 */

type NotificationState = {
  username: string
  items: BackendNotification[]
}

let state: NotificationState | null = null

function seed(username: string): BackendNotification[] {
  return [
    {
      notification_id: 'NTF-MOCK-0001',
      recipient: username,
      kind: 'requirement',
      event: 'requirement_delivered',
      title: '开发者已提交交付',
      body: '需求 REQ-MOCK-0001 已提交交付，请在验收期内确认。',
      link: '/workbench/requirements/REQ-MOCK-0001',
      biz_no: 'REQ-MOCK-0001',
      read: false,
      email_sent: true,
      created_time: '2026-11-08 10:00:00',
      read_time: null,
    },
    {
      notification_id: 'NTF-MOCK-0002',
      recipient: username,
      kind: 'payment',
      event: 'deposit_paid',
      title: '定金已到账',
      body: '需求 REQ-MOCK-0001 的定金 1000 元已到账。',
      link: '/workbench/requirements/REQ-MOCK-0001',
      biz_no: 'REQ-MOCK-0001',
      read: false,
      email_sent: true,
      created_time: '2026-11-07 09:30:00',
      read_time: null,
    },
    {
      notification_id: 'NTF-MOCK-0003',
      recipient: username,
      kind: 'payment',
      event: 'invoice_approved',
      title: '发票已开具',
      body: '需求 REQ-MOCK-0001 的发票已开具，可在发票中心查看。',
      link: '/workbench/invoices',
      biz_no: 'REQ-MOCK-0001',
      read: true,
      email_sent: false,
      created_time: '2026-11-05 16:20:00',
      read_time: '2026-11-05 17:00:00',
    },
    {
      notification_id: 'NTF-MOCK-0004',
      recipient: username,
      kind: 'system',
      event: 'comment_warned',
      title: '评论违规警告',
      body: '你的评论被平台警告：包含广告联系方式。',
      link: '/community',
      biz_no: 'comment:community-77',
      read: true,
      email_sent: true,
      created_time: '2026-11-01 08:00:00',
      read_time: '2026-11-01 09:00:00',
    },
  ]
}

/** 当前身份的收件箱；切换身份后重新铺一份。 */
export function myNotifications(): BackendNotification[] {
  const username = currentMockProfile().username
  if (!state || state.username !== username) {
    state = { username, items: seed(username) }
  }
  return state.items
}

export function unreadNotificationCount(): number {
  return myNotifications().filter((item) => !item.read).length
}

export function markNotificationRead(id: string): BackendNotification | null {
  const item = myNotifications().find((row) => row.notification_id === id)
  if (!item) {
    return null
  }
  if (!item.read) {
    item.read = true
    item.read_time = new Date().toISOString()
  }
  return item
}

export function markAllNotificationsRead(): number {
  let marked = 0
  for (const item of myNotifications()) {
    if (!item.read) {
      item.read = true
      item.read_time = new Date().toISOString()
      marked += 1
    }
  }
  return marked
}
