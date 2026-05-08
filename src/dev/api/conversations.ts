import { authHeader, requestJson } from '@dev/api/http'
import type { RequirementConversation, RequirementConversationDetail } from '@/api/conversations'

export type {
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationMessage,
} from '@/api/conversations'

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
