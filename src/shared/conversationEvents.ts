/**
 * 会话已读的广播事件。
 *
 * 会话是在 `RequirementConversationModal` 里打开的（消息中心内嵌形态、我的需求 / 我的接单的覆盖形态
 * 共用同一个组件），而「未读角标」挂在工作台外壳（`UserWorkbenchView`）与会话列表（`MessagesView`）上，
 * 三者没有父子关系。所以标记已读成功后广播一个事件，由需要刷新的地方订阅，
 * 与 `shared/api/authEvents.ts` 的 401 广播是同一套做法。
 */

export const CONVERSATION_READ_EVENT = '73info:conversation-read'

export type ConversationReadEventDetail = {
  conversationId: string
  requirementId: string
}

export function dispatchConversationRead(detail: ConversationReadEventDetail) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent<ConversationReadEventDetail>(CONVERSATION_READ_EVENT, { detail }))
}
