/**
 * 工单 mock 的数据模型与内存态。
 *
 * 种子数据在 `ticketSeeds.ts`（纯数据构造，不反向依赖本文件），
 * 变更操作与响应映射在 `tickets.ts`。三处共用这里的类型与内存数组。
 */

import { currentMockProfile } from '../identity'

import { seedMockTickets } from './ticketSeeds'

export type MockTicketStatus = 'open' | 'processing' | 'resolved' | 'closed'

export type MockTicketAttachment = {
  id: number
  ticket_id: string
  file_name: string
  content_type: string
  size_bytes: number
  url: string
  created_at: string
}

export type MockTicketMessage = {
  id: number
  ticket_id: string
  sender: string
  sender_role: string
  content: string
  internal: boolean
  attachment_ids: number[]
  created_at: string
}

export type MockTicketEvent = {
  id: number
  ticket_id: string
  event_type: string
  actor: string | null
  actor_role: string | null
  from_value: string | null
  to_value: string | null
  note: string | null
  created_at: string
}

export type MockTicket = {
  id: number
  ticket_id: string
  creator: string
  subject: string
  category: string | null
  priority: string
  status: MockTicketStatus
  source: string
  assigned_to: string | null
  first_response_at: string | null
  first_response_due_at: string | null
  first_response_overdue: boolean
  resolved_at: string | null
  closed_at: string | null
  reopen_count: number
  satisfaction_rating: number | null
  satisfaction_comment: string | null
  satisfaction_rated_at: string | null
  last_user_reply_at: string | null
  last_staff_reply_at: string | null
  last_replied_at: string | null
  last_replied_by: string | null
  unread_count: number
  created_at: string
  updated_at: string
  messages: MockTicketMessage[]
  events: MockTicketEvent[]
}

export const MOCK_TICKET_CREATOR = currentMockProfile().username
export const MOCK_TICKET_STAFF = 'support_demo'

export const ticketCategories = [
  {
    name: '账号',
    sort_order: 1,
    active: true,
    created_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-01 10:00:00',
  },
  {
    name: '支付',
    sort_order: 2,
    active: true,
    created_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-01 10:00:00',
  },
  {
    name: '资源',
    sort_order: 3,
    active: true,
    created_at: '2026-10-01 10:00:00',
    updated_at: '2026-10-01 10:00:00',
  },
]

export const ticketAttachments: MockTicketAttachment[] = [
  {
    id: 1,
    ticket_id: 'TK-20261104-0002',
    file_name: '登录截图.png',
    content_type: 'image/png',
    size_bytes: 128000,
    url: '/api/ticket/attachments/1',
    created_at: '2026-11-03 11:10:00',
  },
]

let ticketSeq = 5
let messageSeq = 100
let eventSeq = 200
let attachmentSeq = 2

export function nextTicketNumber(): number {
  return ticketSeq++
}

export function nextAttachmentId(): number {
  return attachmentSeq++
}

export function makeTicketMessage(
  ticketId: string,
  sender: string,
  senderRole: string,
  content: string,
  createdAt: string,
  attachmentIds: number[] = [],
): MockTicketMessage {
  return {
    id: messageSeq++,
    ticket_id: ticketId,
    sender,
    sender_role: senderRole,
    content,
    internal: false,
    attachment_ids: attachmentIds,
    created_at: createdAt,
  }
}

export function makeTicketEvent(
  ticketId: string,
  eventType: string,
  createdAt: string,
  extra: Partial<MockTicketEvent> = {},
): MockTicketEvent {
  return {
    id: eventSeq++,
    ticket_id: ticketId,
    event_type: eventType,
    actor: null,
    actor_role: null,
    from_value: null,
    to_value: null,
    note: null,
    created_at: createdAt,
    ...extra,
  }
}

export const mockTickets: MockTicket[] = seedMockTickets(MOCK_TICKET_CREATOR)

export function findMockTicket(ticketId: string): MockTicket | undefined {
  return mockTickets.find((item) => item.ticket_id === ticketId)
}
