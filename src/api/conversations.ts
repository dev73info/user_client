import { authHeader, requestJson } from '@/api/http'

export type RequirementConversation = {
  id: number
  conversation_id: string
  requirement_id: string
  requirement_title: string
  customer: string
  developer: string
  status: 'open' | 'closed'
  last_message_at?: string | null
  last_message_by?: string | null
  created_at: string
  updated_at: string
}

export type RequirementConversationMessage = {
  id: number
  conversation_id: string
  sender: string
  sender_role: 'customer' | 'developer'
  content: string
  created_at: string
}

export type RequirementConversationDetail = {
  conversation: RequirementConversation
  messages: RequirementConversationMessage[]
}

export async function listRequirementConversations(
  token: string,
): Promise<RequirementConversation[]> {
  return requestJson<RequirementConversation[]>(
    '/conversations/',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载会话失败',
  )
}

export async function getRequirementConversationByRequirement(
  token: string,
  requirementId: string,
): Promise<RequirementConversationDetail> {
  return requestJson<RequirementConversationDetail>(
    `/conversations/requirement/${encodeURIComponent(requirementId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载会话失败',
  )
}

export async function sendRequirementConversationMessage(
  token: string,
  conversationId: string,
  content: string,
): Promise<RequirementConversationDetail> {
  return requestJson<RequirementConversationDetail>(
    `/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ content }),
    },
    '发送消息失败',
  )
}
