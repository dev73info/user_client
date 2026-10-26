import { authHeaders, requestJson } from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type TicketItem = Schemas['TicketResponse']
export type TicketDetail = Schemas['TicketDetailResponse']
export type TicketMessage = Schemas['TicketMessageResponse']
export type CreateTicketPayload = Schemas['CreateTicketRequest']
export type ReplyTicketPayload = Schemas['ReplyTicketRequest']

export async function listTickets(token: string): Promise<TicketItem[]> {
  return requestJson<TicketItem[]>('/ticket', { headers: authHeaders(token) }, '加载工单失败')
}

export async function createTicket(
  token: string,
  payload: CreateTicketPayload,
): Promise<TicketItem> {
  return requestJson<TicketItem>(
    '/ticket',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '创建工单失败',
  )
}

export async function getTicketDetail(token: string, ticketId: string): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    `/ticket/${encodeURIComponent(ticketId)}`,
    { headers: authHeaders(token) },
    '加载工单详情失败',
  )
}

export async function replyTicket(
  token: string,
  ticketId: string,
  payload: ReplyTicketPayload,
): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    `/ticket/${encodeURIComponent(ticketId)}/messages`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '回复工单失败',
  )
}

export async function closeTicket(token: string, ticketId: string): Promise<TicketItem> {
  return requestJson<TicketItem>(
    `/ticket/${encodeURIComponent(ticketId)}/close`,
    { method: 'PATCH', headers: authHeaders(token) },
    '关闭工单失败',
  )
}
