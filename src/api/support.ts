import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

export type SupportConversation = components['schemas']['SupportConversationResponse']
export type SupportConversationDetail = components['schemas']['SupportConversationDetailResponse']
export type SupportMessage = components['schemas']['SupportMessageResponse']
export type PublicSupportChannel = components['schemas']['PublicChannelResponse']

export function listMySupportConversations(token: string): Promise<SupportConversation[]> {
  return requestJson('/support/conversations/mine', { headers: authHeaders(token) }, '加载会话失败')
}

export function getSupportConversationDetail(
  token: string,
  id: number,
): Promise<SupportConversationDetail> {
  return requestJson(
    `/support/conversations/${id}`,
    { headers: authHeaders(token) },
    '加载会话详情失败',
  )
}

export function createSupportConversation(
  token: string,
  content: string,
): Promise<SupportConversation> {
  return requestJson(
    '/support/conversations',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content }),
    },
    '创建会话失败',
  )
}

export function sendSupportMessage(
  token: string,
  id: number,
  content: string,
): Promise<SupportMessage> {
  return requestJson(
    `/support/conversations/${id}/messages`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ content }),
    },
    '发送消息失败',
  )
}

export function listPublicSupportChannels(): Promise<PublicSupportChannel[]> {
  return requestJson('/support/channels/public', {}, '加载客服渠道失败')
}

export function supportConversationWsUrl(token: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.host}/api/support/conversations/ws?token=${encodeURIComponent(token.trim())}`
}
