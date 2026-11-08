/**
 * 工单 mock 的变更操作与响应映射。
 *
 * 状态自洽：`resolved_at` / `closed_at` 决定 7 天重开窗口与动作可用性；
 * 回复已结束工单时，窗口内自动重开，超期返回 `expired` 由路由回 409。
 */

import { datetime } from './shared'
import {
  MOCK_TICKET_CREATOR,
  findMockTicket,
  makeTicketEvent,
  makeTicketMessage,
  mockTickets,
  nextAttachmentId,
  nextTicketNumber,
  ticketAttachments,
  ticketCategories,
  type MockTicket,
  type MockTicketAttachment,
} from './ticketModel'

export { findMockTicket, ticketAttachments, ticketCategories }
export type { MockTicket, MockTicketAttachment }

const REOPEN_WINDOW_MS = 7 * 86_400_000

function parseTime(value: string | null): number {
  if (!value) return 0
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

export function isWithinReopenWindow(ticket: MockTicket): boolean {
  const base = ticket.closed_at ?? ticket.resolved_at
  if (!base) return ticket.status === 'resolved' || ticket.status === 'closed'
  return Date.now() - parseTime(base) <= REOPEN_WINDOW_MS
}

export function actionsFor(ticket: MockTicket) {
  const ended = ticket.status === 'resolved' || ticket.status === 'closed'
  const within = isWithinReopenWindow(ticket)
  return {
    can_reply: !ended || within,
    can_close: ticket.status === 'open' || ticket.status === 'processing',
    can_reopen: ended && within,
    can_rate: ended,
    can_claim: false,
    can_release: false,
    can_transfer: false,
    can_resolve: false,
    can_assign: false,
  }
}

function toAttachmentResponse(attachment: MockTicketAttachment) {
  const { ticket_id: _ticketId, ...rest } = attachment
  void _ticketId
  return rest
}

function toMessageResponse(ticketMessage: MockTicket['messages'][number]) {
  return {
    id: ticketMessage.id,
    ticket_id: ticketMessage.ticket_id,
    sender: ticketMessage.sender,
    sender_role: ticketMessage.sender_role,
    content: ticketMessage.content,
    internal: ticketMessage.internal,
    attachments: ticketAttachments
      .filter((item) => ticketMessage.attachment_ids.includes(item.id))
      .map(toAttachmentResponse),
    created_at: ticketMessage.created_at,
  }
}

export function toTicketResponse(ticket: MockTicket) {
  const { messages: _messages, events: _events, ...rest } = ticket
  void _messages
  void _events
  return rest
}

export function toTicketDetail(ticket: MockTicket) {
  return {
    ticket: toTicketResponse(ticket),
    messages: ticket.messages.map(toMessageResponse),
    events: ticket.events.map((item) => ({ ...item })),
    actions: actionsFor(ticket),
  }
}

export function listMockTickets(query: {
  status?: string
  page?: number
  page_size?: number
}) {
  const filtered =
    query.status && query.status !== 'all'
      ? mockTickets.filter((item) => item.status === query.status)
      : mockTickets
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.page_size ?? 20)
  const start = (page - 1) * pageSize
  return {
    items: filtered.slice(start, start + pageSize).map(toTicketResponse),
    total: filtered.length,
    page,
    page_size: pageSize,
  }
}

export function createMockTicket(input: {
  subject: string
  content: string
  category?: string | null
  priority?: string | null
  attachment_ids?: number[]
}): MockTicket {
  const now = datetime()
  const id = nextTicketNumber()
  const ticketId = `TK-DEMO-${String(id).padStart(4, '0')}`
  const ticket: MockTicket = {
    id,
    ticket_id: ticketId,
    creator: MOCK_TICKET_CREATOR,
    subject: input.subject,
    category: input.category ?? null,
    priority: input.priority ?? 'normal',
    status: 'open',
    source: 'web',
    assigned_to: null,
    first_response_at: null,
    first_response_due_at: null,
    first_response_overdue: false,
    resolved_at: null,
    closed_at: null,
    reopen_count: 0,
    satisfaction_rating: null,
    satisfaction_comment: null,
    satisfaction_rated_at: null,
    last_user_reply_at: now,
    last_staff_reply_at: null,
    last_replied_at: now,
    last_replied_by: MOCK_TICKET_CREATOR,
    unread_count: 0,
    created_at: now,
    updated_at: now,
    messages: [
      makeTicketMessage(
        ticketId,
        MOCK_TICKET_CREATOR,
        'user',
        input.content,
        now,
        input.attachment_ids ?? [],
      ),
    ],
    events: [
      makeTicketEvent(ticketId, 'created', now, {
        actor: MOCK_TICKET_CREATOR,
        actor_role: 'user',
      }),
    ],
  }
  mockTickets.unshift(ticket)
  return ticket
}

export function appendMockUserMessage(
  ticket: MockTicket,
  input: { content: string; attachment_ids?: number[] },
): 'expired' | MockTicket {
  const now = datetime()
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    if (!isWithinReopenWindow(ticket)) return 'expired'
    const from = ticket.status
    ticket.status = 'processing'
    ticket.closed_at = null
    ticket.resolved_at = null
    ticket.reopen_count += 1
    ticket.events.push(
      makeTicketEvent(ticket.ticket_id, 'reopened', now, {
        actor: MOCK_TICKET_CREATOR,
        actor_role: 'user',
        from_value: from,
        to_value: 'processing',
        note: '用户回复自动重开',
      }),
    )
  }
  ticket.messages.push(
    makeTicketMessage(
      ticket.ticket_id,
      MOCK_TICKET_CREATOR,
      'user',
      input.content,
      now,
      input.attachment_ids ?? [],
    ),
  )
  ticket.last_user_reply_at = now
  ticket.last_replied_at = now
  ticket.last_replied_by = MOCK_TICKET_CREATOR
  ticket.updated_at = now
  ticket.unread_count = 0
  return ticket
}

export function closeMockTicket(ticket: MockTicket): MockTicket {
  const now = datetime()
  const from = ticket.status
  ticket.status = 'closed'
  ticket.closed_at = now
  ticket.resolved_at = ticket.resolved_at ?? now
  ticket.updated_at = now
  ticket.events.push(
    makeTicketEvent(ticket.ticket_id, 'closed', now, {
      actor: MOCK_TICKET_CREATOR,
      actor_role: 'user',
      from_value: from,
      to_value: 'closed',
    }),
  )
  return ticket
}

export function reopenMockTicket(ticket: MockTicket): 'expired' | MockTicket {
  if (!isWithinReopenWindow(ticket)) return 'expired'
  const now = datetime()
  const from = ticket.status
  ticket.status = 'processing'
  ticket.closed_at = null
  ticket.resolved_at = null
  ticket.reopen_count += 1
  ticket.updated_at = now
  ticket.events.push(
    makeTicketEvent(ticket.ticket_id, 'reopened', now, {
      actor: MOCK_TICKET_CREATOR,
      actor_role: 'user',
      from_value: from,
      to_value: 'processing',
    }),
  )
  return ticket
}

export function rateMockTicket(
  ticket: MockTicket,
  rating: number,
  comment?: string | null,
): boolean {
  if (ticket.status !== 'resolved' && ticket.status !== 'closed') return false
  if (rating < 1 || rating > 5) return false
  const now = datetime()
  ticket.satisfaction_rating = rating
  ticket.satisfaction_comment = comment ?? null
  ticket.satisfaction_rated_at = now
  ticket.updated_at = now
  ticket.events.push(
    makeTicketEvent(ticket.ticket_id, 'rated', now, {
      actor: MOCK_TICKET_CREATOR,
      actor_role: 'user',
      note: `${rating} 星`,
    }),
  )
  return true
}

export function markMockRead(ticket: MockTicket): void {
  ticket.unread_count = 0
}

export function createMockAttachment(input: {
  name?: string
  type?: string
  size?: number
}): MockTicketAttachment {
  const id = nextAttachmentId()
  const attachment: MockTicketAttachment = {
    id,
    ticket_id: '',
    file_name: input.name || `附件-${id}`,
    content_type: input.type || 'application/octet-stream',
    size_bytes: input.size ?? 1024,
    url: `/api/ticket/attachments/${id}`,
    created_at: datetime(),
  }
  ticketAttachments.push(attachment)
  return attachment
}
