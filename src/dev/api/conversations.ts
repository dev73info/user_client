import { apiUrl, authHeader, requestJson } from '@dev/api/http'
import { subscribeJsonEventStream } from '@/shared/api/sse'
import type { RequirementConversation, RequirementConversationDetail } from '@/api/conversations'
import type { RequirementConversationEventCallbacks } from '@/api/conversations'

export type {
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationEventCallbacks,
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
  attachment?: File,
): Promise<RequirementConversationDetail> {
  if (attachment) {
    const formData = new FormData()
    formData.append('content', content)
    formData.append('file', attachment)

    return requestJson<RequirementConversationDetail>(
      `/conversations/${encodeURIComponent(conversationId)}/messages/attachment`,
      {
        method: 'POST',
        headers: {
          ...authHeader(token),
        },
        body: formData,
      },
      '发送消息失败',
    )
  }

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

export function subscribeRequirementConversationEvents(
  token: string,
  callbacks: RequirementConversationEventCallbacks,
): () => void {
  return subscribeJsonEventStream<RequirementConversationDetail>(
    apiUrl('/conversations/events'),
    {
      headers: {
        Accept: 'text/event-stream',
        ...authHeader(token),
      },
    },
    'conversation.updated',
    {
      onEvent: callbacks.onUpdate,
      onOpen: callbacks.onOpen,
      onClose: callbacks.onClose,
      onError: callbacks.onError,
    },
  )
}
