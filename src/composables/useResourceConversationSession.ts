import * as conversationApi from '@/api/conversations'
import type { RequirementConversationDetail } from '@/api/conversations'
import { useConversationSession } from '@/composables/useConversationSession'

type SessionSources = {
  token: string
  /** 从插件详情页进入时只有资源编号：后端按「资源 + 当前买家」补建 / 读取会话。 */
  resourceId?: number | null
  /** 从消息中心进入时带会话编号：作者按会话编号读取，不再走「按资源补建」。 */
  conversationId?: string | null
  visible: boolean
  onUpdated: (detail: RequirementConversationDetail) => void
  scrollContainer: () => HTMLElement | null
}

/**
 * 插件咨询会话的载入、已读上报与实时续传。
 *
 * 与需求会话共用 `useConversationSession`；差异只有两处：
 * - 载入：有会话编号按会话编号读，否则按资源编号打开（购买者会自动补建）；
 * - 实时载荷匹配：有会话编号按会话编号，否则按「资源 + 当前买家」的资源会话。
 */
export function useResourceConversationSession(readSources: () => SessionSources) {
  return useConversationSession(() => {
    const sources = readSources()
    const conversationId = sources.conversationId?.trim() || ''
    const resourceId = sources.resourceId ?? null
    return {
      token: sources.token,
      visible: sources.visible,
      hasSubject: Boolean(conversationId || resourceId),
      loadDetail: () =>
        conversationId
          ? conversationApi.getConversationDetail(sources.token, conversationId)
          : conversationApi.getResourceConversation(sources.token, Number(resourceId)),
      matchesRealtime: (payload) =>
        conversationId
          ? payload.conversation.conversation_id === conversationId
          : payload.conversation.scene === 'resource' &&
            payload.conversation.resource_id === resourceId,
      onUpdated: sources.onUpdated,
      scrollContainer: sources.scrollContainer,
    }
  })
}
