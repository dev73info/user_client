import * as conversationApi from '@/api/conversations'
import type { RequirementConversationDetail } from '@/api/conversations'
import { fetchRequirementDetail } from '@/api/requirements'
import { isRequirementArchived } from '@/shared/requirementArchive'
import { useConversationSession, type RealtimeStatus } from '@/composables/useConversationSession'

export type { RealtimeStatus }

type SessionSources = {
  token: string
  requirementId: string
  visible: boolean
  /** 详情被整体替换之后回调：父组件把详情 emit 出去，自己不再另存一份。 */
  onUpdated: (detail: RequirementConversationDetail) => void
  /** 时间线容器（滚到底部用）。容器还在父组件里，这里只要一个取用口。 */
  scrollContainer: () => HTMLElement | null
}

/**
 * 需求会话的载入、已读上报与实时续传。
 *
 * 通用逻辑（载入 / 已读 / SSE / 断线补拉）在 `useConversationSession`；这里只提供
 * 「按需求编号打开」与「超期归档」两个需求场景特有的取数口径。
 */
export function useRequirementConversationSession(readSources: () => SessionSources) {
  const session = useConversationSession(() => {
    const sources = readSources()
    return {
      token: sources.token,
      visible: sources.visible,
      hasSubject: Boolean(sources.requirementId),
      loadDetail: () =>
        conversationApi.getRequirementConversationByRequirement(
          sources.token,
          sources.requirementId,
        ),
      matchesRealtime: (payload) =>
        payload.conversation.requirement_id === sources.requirementId,
      afterLoad: async () => {
        // R014：读一次需求详情拿「超期锁定 / 已清除」标记（读取即触发后端收口）。失败不阻断会话。
        try {
          const item = await fetchRequirementDetail(sources.token, sources.requirementId)
          return isRequirementArchived(item)
        } catch {
          return false
        }
      },
      onUpdated: sources.onUpdated,
      scrollContainer: sources.scrollContainer,
    }
  })

  return {
    ...session,
    requirementArchived: session.archived,
  }
}
