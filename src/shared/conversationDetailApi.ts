import type { RequirementConversationDetail } from '@/shared/conversations'

type ConversationHttpClient = {
  authHeader: (token: string) => Record<string, string>
  requestJson: <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
}

/**
 * 按会话编号 / 资源编号读会话详情。
 *
 * 需求会话的「按需求编号打开」在 `createConversationApi` 里；这两个入口是插件咨询
 * 与消息中心共用的补充查询，单独放一个工厂避免把 `conversations.ts` 撑过行数预算。
 */
export function createConversationDetailApi(http: ConversationHttpClient) {
  /** 按会话编号读详情（需求会话 / 插件咨询通用）。 */
  async function getConversationDetail(
    token: string,
    conversationId: string,
  ): Promise<RequirementConversationDetail> {
    return http.requestJson<RequirementConversationDetail>(
      `/conversation/${encodeURIComponent(conversationId)}`,
      { headers: { ...http.authHeader(token) } },
      '加载会话失败',
    )
  }

  /**
   * 购买者按资源打开插件咨询会话：不存在时后端补建（一个买家对一个资源只有一个会话）。
   * 未购买者 / 作者本人调用会被后端 403 挡下。
   */
  async function getResourceConversation(
    token: string,
    resourceId: number,
  ): Promise<RequirementConversationDetail> {
    return http.requestJson<RequirementConversationDetail>(
      `/conversation/resource/${encodeURIComponent(String(resourceId))}`,
      { headers: { ...http.authHeader(token) } },
      '加载会话失败',
    )
  }

  return { getConversationDetail, getResourceConversation }
}
