import { subscribeJsonEventStream } from '@/shared/api/sse'

export type ConversationConsent = 'pending' | 'approved' | 'rejected'

/**
 * 现任开发者视角下的一段历史沟通（接手前由别人负责、或中间接手的开发者那段）：
 * 默认对他隐藏，需要前任开发者与客户各投一票才公开。
 */
export type ConversationHistorySegment = {
  previous_developer: string
  segment_start: string
  segment_end: string
  /** hidden：还没申请；pending：等待双方确认；approved：已公开；rejected：申请被拒 */
  status: ConversationConsent | 'hidden'
  developer_consent: ConversationConsent
  customer_consent: ConversationConsent
  disclosure_id?: number | null
}

/** 一条历史沟通公开申请（发起人、两位开发者与两票状态）。 */
export type ConversationHistoryDisclosure = {
  id: number
  conversation_id: string
  requirement_id: string
  requirement_title: string
  customer: string
  previous_developer: string
  current_developer: string
  developer_consent: ConversationConsent
  customer_consent: ConversationConsent
  status: ConversationConsent
  created_at: string
}

/** 会话详情附带的历史沟通公开申请：参与者都拿得到，用于渲染「待我确认」条。 */
export type ConversationHistoryDisclosureBrief = {
  id: number
  previous_developer: string
  current_developer: string
  developer_consent: ConversationConsent
  customer_consent: ConversationConsent
  status: ConversationConsent
}

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
  /** 查看者视角下的历史沟通区段；客户恒为空数组（客户不受隐藏限制）。 */
  history_segments?: ConversationHistorySegment[]
  /** 本会话的历史沟通公开申请：客户与现任开发者据此渲染待确认条。 */
  history_disclosures?: ConversationHistoryDisclosureBrief[]
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
  /** 掉线后重新连上时触发（首次连上不触发），用于补拉断线期间漏掉的消息。 */
  onReconnect?: () => void
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

  /**
   * 现任开发者申请公开接手前的历史沟通：为每个还没公开、也还没申请过的区段各建一条申请。
   * 返回刷新后的会话详情（含新的区段状态）。
   */
  async function requestRequirementHistoryDisclosure(
    token: string,
    requirementId: string,
  ): Promise<RequirementConversationDetail> {
    return http.requestJson<RequirementConversationDetail>(
      `/conversations/history-disclosures/requirement/${encodeURIComponent(requirementId)}`,
      {
        method: 'POST',
        headers: { ...http.authHeader(token) },
      },
      '申请查看历史沟通失败',
    )
  }

  /** 与我相关的历史沟通公开申请：我发起的、待我确认的、以及涉及我的。 */
  async function listConversationHistoryDisclosures(
    token: string,
  ): Promise<ConversationHistoryDisclosure[]> {
    return http.requestJson<ConversationHistoryDisclosure[]>(
      '/conversations/history-disclosures',
      { headers: { ...http.authHeader(token) } },
      '加载历史沟通申请失败',
    )
  }

  /** 对历史沟通公开申请投票：前任开发者与客户各一票，两票齐才公开该段。 */
  async function respondConversationHistoryDisclosure(
    token: string,
    disclosureId: number,
    decision: 'approved' | 'rejected',
  ): Promise<ConversationHistoryDisclosure> {
    return http.requestJson<ConversationHistoryDisclosure>(
      `/conversations/history-disclosures/${disclosureId}/respond`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...http.authHeader(token),
        },
        body: JSON.stringify({ decision }),
      },
      '提交历史沟通申请表决失败',
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
        onReconnect: callbacks.onReconnect,
        onClose: callbacks.onClose,
        onError: callbacks.onError,
      },
    )
  }

  return {
    listRequirementConversations,
    getRequirementConversationByRequirement,
    sendRequirementConversationMessage,
    requestRequirementHistoryDisclosure,
    listConversationHistoryDisclosures,
    respondConversationHistoryDisclosure,
    subscribeRequirementConversationEvents,
  }
}
