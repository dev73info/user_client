import type { components } from '@/api/generated/schema'
import { authHeaders, requestBlob, requestJson } from '@/api/http'

type GeneratedConversation = components['schemas']['SupportConversationResponse']

export type SupportConversation = GeneratedConversation & {
  is_guest?: boolean
  satisfaction_rating?: number | null
  satisfaction_comment?: string | null
  satisfaction_rated_at?: string | null
  satisfaction_rated_by?: string | null
  last_user_message_at?: string | null
  last_agent_message_at?: string | null
  assigned_at?: string | null
}
export type SupportConversationDetail = Omit<
  components['schemas']['SupportConversationDetailResponse'],
  'conversation' | 'messages'
> & {
  conversation: SupportConversation
  messages: SupportMessage[]
}
export type SupportMessage = components['schemas']['SupportMessageResponse'] & {
  attachments?: SupportAttachment[]
}
export type SupportAttachment = {
  id: number
  file_name: string
  content_type: string | null
  size_bytes: number
  url: string
  created_at: string
}
export type SupportAvailability = {
  online: boolean
  online_agents: number
}
export type PublicSupportChannel = components['schemas']['PublicChannelResponse']

export const SUPPORT_GUEST_TOKEN_PREFIX = '73sg_'

export function isSupportGuestToken(token: string): boolean {
  return token.trim().startsWith(SUPPORT_GUEST_TOKEN_PREFIX)
}

function supportPath(token: string, path: string): string {
  return isSupportGuestToken(token) ? `/support/guest${path}` : `/support${path}`
}

export async function createSupportGuestSession(): Promise<{
  token: string
  display_name: string
}> {
  return requestJson(
    '/support/guest/session',
    { method: 'POST' },
    '创建访客咨询失败',
  )
}

export function listMySupportConversations(token: string): Promise<SupportConversation[]> {
  const path = isSupportGuestToken(token) ? '/support/guest/conversations' : '/support/conversations/mine'
  return requestJson(path, { headers: authHeaders(token) }, '加载会话失败')
}

export function getSupportConversationDetail(
  token: string,
  id: number,
): Promise<SupportConversationDetail> {
  return requestJson(
    supportPath(token, `/conversations/${id}`),
    { headers: authHeaders(token) },
    '加载会话详情失败',
  )
}

export function createSupportConversation(
  token: string,
  content: string,
  attachmentIds: number[] = [],
): Promise<SupportConversation> {
  const body = attachmentIds.length ? { content, attachment_ids: attachmentIds } : { content }
  return requestJson(
    supportPath(token, '/conversations'),
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '创建会话失败',
  )
}

export function sendSupportMessage(
  token: string,
  id: number,
  content: string,
  attachmentIds: number[] = [],
): Promise<SupportMessage> {
  const body = attachmentIds.length ? { content, attachment_ids: attachmentIds } : { content }
  return requestJson(
    supportPath(token, `/conversations/${id}/messages`),
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '发送消息失败',
  )
}

export function rateSupportConversation(
  token: string,
  id: number,
  rating: number,
  comment: string | null,
): Promise<SupportConversation> {
  return requestJson(
    supportPath(token, `/conversations/${id}/satisfaction`),
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rating, comment }),
    },
    '提交评价失败',
  )
}

export function getSupportAvailability(): Promise<SupportAvailability> {
  return requestJson('/support/availability/public', {}, '加载客服在线状态失败')
}

export function uploadSupportAttachment(token: string, file: File): Promise<SupportAttachment> {
  const form = new FormData()
  form.append('file', file)
  return requestJson(
    supportPath(token, '/attachments'),
    { method: 'POST', headers: authHeaders(token), body: form },
    '上传附件失败',
  )
}

export function downloadSupportAttachment(token: string, id: number): Promise<Blob> {
  return requestBlob(
    supportPath(token, `/attachments/${encodeURIComponent(String(id))}`),
    { headers: authHeaders(token) },
    '下载附件失败',
  )
}

export function listPublicSupportChannels(): Promise<PublicSupportChannel[]> {
  return requestJson('/support/channels/public', {}, '加载客服渠道失败')
}

export function supportConversationWsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const path = isSupportGuestToken(token)
    ? '/api/support/guest/conversations/ws'
    : '/api/support/conversations/ws'
  return `${protocol}://${window.location.host}${path}?token=${encodeURIComponent(token.trim())}`
}
