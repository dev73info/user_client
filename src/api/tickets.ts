import {
  authHeader,
  authHeaders,
  HttpError,
  requestBlob,
  requestJson,
  requestVoid,
} from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

/**
 * 工单 v2 类型。
 *
 * 后端 `openapi.json` 的工单 v2 schema 尚未补齐 `TicketResponse.unread_count` 与
 * `avg_first_response_seconds`，本仓暂不重生成契约（见任务第 6 条），
 * 这里按「现有生成物 + 后端已实现的 v2 字段」做局部扩展。
 * 待后端最终 openapi 落定后，本段整体替换为 `components['schemas']` 对应项。
 */
export type TicketItem = Schemas['TicketResponse'] & {
  first_response_at?: string | null
  first_response_due_at?: string | null
  first_response_overdue?: boolean
  resolved_at?: string | null
  closed_at?: string | null
  reopen_count?: number
  satisfaction_rating?: number | null
  satisfaction_comment?: string | null
  satisfaction_rated_at?: string | null
  last_user_reply_at?: string | null
  last_staff_reply_at?: string | null
  source?: string
  unread_count?: number
}

export type TicketAttachment = {
  id: number
  file_name: string
  content_type?: string | null
  size_bytes: number
  url: string
  created_at: string
}

export type TicketMessage = Schemas['TicketMessageResponse'] & {
  attachments: TicketAttachment[]
}

export type TicketEvent = {
  id: number
  ticket_id: string
  event_type: string
  actor?: string | null
  actor_role?: string | null
  from_value?: string | null
  to_value?: string | null
  note?: string | null
  created_at: string
}

export type TicketActions = {
  can_reply: boolean
  can_close: boolean
  can_reopen: boolean
  can_rate: boolean
  can_claim: boolean
  can_release: boolean
  can_transfer: boolean
  can_resolve: boolean
  can_assign: boolean
}

export type TicketDetail = {
  ticket: TicketItem
  messages: TicketMessage[]
  events: TicketEvent[]
  actions: TicketActions
}

export type TicketPage = {
  items: TicketItem[]
  total: number
  page: number
  page_size: number
}

export type TicketCategory = {
  name: string
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type CreateTicketPayload = Schemas['CreateTicketRequest'] & { attachment_ids?: number[] }
export type ReplyTicketPayload = Schemas['ReplyTicketRequest'] & { attachment_ids?: number[] }
export type SatisfactionPayload = { rating: number; comment?: string | null }
export type TicketListParams = { status?: string; page?: number; page_size?: number }

/** 后端业务错误码：resolved/closed 超过 7 天再回复。 */
export const TICKET_REOPEN_EXPIRED = 'TICKET_REOPEN_EXPIRED'

/** 重开 / 回复超期：按错误码分支，不匹配文案。 */
export function isReopenExpiredError(error: unknown): boolean {
  return error instanceof HttpError && error.code === TICKET_REOPEN_EXPIRED
}

function ticketListPath(params: TicketListParams): string {
  const query = new URLSearchParams()
  if (params.status && params.status !== 'all') query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const text = query.toString()
  return text ? `/ticket?${text}` : '/ticket'
}

export async function listTickets(
  token: string,
  params: TicketListParams = {},
): Promise<TicketPage> {
  return requestJson<TicketPage>(ticketListPath(params), { headers: authHeaders(token) }, '加载工单失败')
}

export async function getTicketDetail(token: string, ticketId: string): Promise<TicketDetail> {
  return requestJson<TicketDetail>(
    `/ticket/${encodeURIComponent(ticketId)}`,
    { headers: authHeaders(token) },
    '加载工单详情失败',
  )
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

export async function reopenTicket(token: string, ticketId: string): Promise<TicketItem> {
  return requestJson<TicketItem>(
    `/ticket/${encodeURIComponent(ticketId)}/reopen`,
    { method: 'PATCH', headers: authHeaders(token) },
    '重开工单失败',
  )
}

export async function rateTicket(
  token: string,
  ticketId: string,
  payload: SatisfactionPayload,
): Promise<TicketItem> {
  return requestJson<TicketItem>(
    `/ticket/${encodeURIComponent(ticketId)}/satisfaction`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '提交评价失败',
  )
}

export async function markTicketRead(token: string, ticketId: string): Promise<void> {
  return requestVoid(
    `/ticket/${encodeURIComponent(ticketId)}/read`,
    { method: 'PATCH', headers: authHeaders(token) },
    '标记已读失败',
  )
}

export async function listTicketCategories(token: string): Promise<TicketCategory[]> {
  return requestJson<TicketCategory[]>(
    '/ticket/categories',
    { headers: authHeaders(token) },
    '加载工单分类失败',
  )
}

export async function uploadTicketAttachment(
  token: string,
  file: File,
): Promise<TicketAttachment> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<TicketAttachment>(
    '/ticket/attachments',
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传附件失败',
  )
}

/** 附件下载需要 Bearer，不能裸开 `<a href>`；调用方拿 Blob 后自行触发下载。 */
export async function downloadTicketAttachment(
  token: string,
  attachmentId: number,
): Promise<Blob> {
  return requestBlob(
    `/ticket/attachments/${encodeURIComponent(String(attachmentId))}`,
    { headers: authHeaders(token) },
    '下载附件失败',
  )
}

/** 用户侧工单实时事件（WebSocket）：只推当前用户自己的工单。 */
export function ticketWsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/tickets/ws?token=${encodeURIComponent(token.trim())}`
}
