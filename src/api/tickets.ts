import { authHeader, requestJson } from '@/api/http'

export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'
export type TicketStatus = 'open' | 'processing' | 'resolved' | 'closed'

export type TicketItem = {
  id: number
  ticket_id: string
  creator: string
  subject: string
  category?: string | null
  priority: TicketPriority
  status: TicketStatus
  assigned_to?: string | null
  last_replied_at?: string | null
  last_replied_by?: string | null
  created_at: string
  updated_at: string
}

export type TicketMessageItem = {
  id: number
  ticket_id: string
  sender: string
  sender_role: string
  content: string
  internal: boolean
  created_at: string
}

export type TicketDetail = {
  ticket: TicketItem
  messages: TicketMessageItem[]
}

export type CreateTicketPayload = {
  subject: string
  content: string
  category?: string
  priority?: TicketPriority
}

export type ReplyTicketPayload = {
  content: string
}

export async function listTickets(token: string): Promise<TicketItem[]> {
  return requestJson<TicketItem[]>(
    '/tickets/',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载工单失败',
  )
}

export async function createTicket(
  token: string,
  payload: CreateTicketPayload,
): Promise<TicketItem> {
  return requestJson<TicketItem>(
    '/tickets/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '创建工单失败',
  )
}

export async function getTicketDetail(token: string, ticketId: string): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    `/tickets/${encodeURIComponent(ticketId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载工单详情失败',
  )
}

export async function replyTicket(
  token: string,
  ticketId: string,
  payload: ReplyTicketPayload,
): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    `/tickets/${encodeURIComponent(ticketId)}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '回复工单失败',
  )
}

export async function closeTicket(token: string, ticketId: string): Promise<TicketItem> {
  return requestJson<TicketItem>(
    `/tickets/${encodeURIComponent(ticketId)}/close`,
    {
      method: 'PATCH',
      headers: {
        ...authHeader(token),
      },
    },
    '关闭工单失败',
  )
}
