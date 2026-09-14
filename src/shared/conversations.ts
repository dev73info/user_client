import { subscribeJsonEventStream } from '@/shared/api/sse'

export type RequirementConversation = {
  id: number
  conversation_id: string
  requirement_id: string
  requirement_title: string
  customer: string
  customer_avatar_url?: string | null
  developer: string
  status: 'open' | 'closed'
  requirement_status: string
  last_message_at?: string | null
  last_message_by?: string | null
  last_message_content?: string | null
  last_message_attachment_url?: string | null
  last_message_attachment_mime?: string | null
  created_at: string
  updated_at: string
}

export type RequirementConversationMessage = {
  id: number
  conversation_id: string
  sender: string
  sender_role: 'customer' | 'developer' | 'platform'
  content: string
  attachment_url?: string | null
  attachment_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
  /** 'text' 为双方手发消息，'card' 为平台写入的状态变化卡片。 */
  message_type?: string | null
  /** 卡片事件码（仅卡片消息有值），见 @/shared/conversationCards。 */
  action_type?: string | null
  /** 卡片关联标识：合同编号 / 交付版本号 / 解绑原因等。 */
  action_ref?: string | null
  created_at: string
}

export type RequirementConversationDetail = {
  conversation: RequirementConversation
  messages: RequirementConversationMessage[]
}

export type RequirementConversationEventCallbacks = {
  onUpdate: (detail: RequirementConversationDetail) => void
  onOpen?: () => void
  onClose?: () => void
  onError?: (error: Error) => void
}

type ConversationHttpClient = {
  apiUrl: (path: string) => string
  authHeader: (token: string) => Record<string, string>
  requestJson: <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
}

export function createConversationApi(http: ConversationHttpClient) {
  async function listRequirementConversations(
    token: string,
  ): Promise<RequirementConversation[]> {
    return http.requestJson<RequirementConversation[]>(
      '/conversations/',
      { headers: { ...http.authHeader(token) } },
      '加载会话失败',
    )
  }

  async function getRequirementConversationByRequirement(
    token: string,
    requirementId: string,
  ): Promise<RequirementConversationDetail> {
    return http.requestJson<RequirementConversationDetail>(
      `/conversations/requirement/${encodeURIComponent(requirementId)}`,
      { headers: { ...http.authHeader(token) } },
      '加载会话失败',
    )
  }

  async function sendRequirementConversationMessage(
    token: string,
    conversationId: string,
    content: string,
    attachment?: File,
  ): Promise<RequirementConversationDetail> {
    if (attachment) {
      const formData = new FormData()
      formData.append('content', content)
      formData.append('file', attachment)

      return http.requestJson<RequirementConversationDetail>(
        `/conversations/${encodeURIComponent(conversationId)}/messages/attachment`,
        {
          method: 'POST',
          headers: { ...http.authHeader(token) },
          body: formData,
        },
        '发送消息失败',
      )
    }

    return http.requestJson<RequirementConversationDetail>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...http.authHeader(token),
        },
        body: JSON.stringify({ content }),
      },
      '发送消息失败',
    )
  }

  function subscribeRequirementConversationEvents(
    token: string,
    callbacks: RequirementConversationEventCallbacks,
  ): () => void {
    return subscribeJsonEventStream<RequirementConversationDetail>(
      http.apiUrl('/conversations/events'),
      {
        headers: {
          Accept: 'text/event-stream',
          ...http.authHeader(token),
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

  return {
    listRequirementConversations,
    getRequirementConversationByRequirement,
    sendRequirementConversationMessage,
    subscribeRequirementConversationEvents,
  }
}
