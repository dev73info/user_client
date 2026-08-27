import { authHeaders, requestJson } from '@/api/http'

export type SupportConversationStatus = 'open' | 'closed'

export type SupportConversation = {
  id: number
  conversation_no: string
  user_username: string
  user_role: string
  agent_username: string | null
  status: SupportConversationStatus
  priority: string
  last_message: string | null
  last_message_at: string | null
  last_message_by: string | null
  unread_agent: number
  unread_user: number
  agent_last_read_message_id: number | null
  user_last_read_message_id: number | null
  created_at: string
  updated_at: string
}

export type SupportMessage = {
  id: number
  conversation_id: number
  sender_username: string
  sender_role: 'user' | 'agent'
  content: string
  created_at: string
}

export type SupportConversationDetail = {
  conversation: SupportConversation
  messages: SupportMessage[]
}

/** 我的会话（用户侧）。 */
export async function listMySupportConversations(
  token: string,
): Promise<SupportConversation[]> {
  return requestJson('/support/conversations/mine', {
    headers: authHeaders(token),
  }, '加载会话失败')
}

export async function getSupportConversationDetail(
  token: string,
  id: number,
): Promise<SupportConversationDetail> {
  return requestJson(`/support/conversations/${id}`, {
    headers: authHeaders(token),
  }, '加载会话详情失败')
}

/** 创建会话，并以 content 作为首条消息。 */
export async function createSupportConversation(
  token: string,
  content: string,
): Promise<SupportConversation> {
  return requestJson('/support/conversations', {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  }, '创建会话失败')
}

export async function sendSupportMessage(
  token: string,
  id: number,
  content: string,
): Promise<SupportMessage> {
  return requestJson(`/support/conversations/${id}/messages`, {
    method: 'POST',
    headers: authHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ content }),
  }, '发送消息失败')
}

export function supportConversationWsUrl(token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/api/support/conversations/ws?token=${encodeURIComponent(token)}`
}
