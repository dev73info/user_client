import { computed, ref } from 'vue'
import { TMessage } from 'ui_73info'

import {
  requestRequirementHistoryDisclosure,
  respondConversationHistoryDisclosure,
} from '@/api/conversations'
import type {
  ConversationConsent,
  ConversationHistoryDisclosureBrief,
  ConversationHistorySegment,
  RequirementConversation,
  RequirementConversationDetail,
  RequirementConversationMessage,
} from '@/shared/conversations'

/**
 * 接手前历史沟通的公开表决。
 *
 * 从 `RequirementConversationModal.vue` 抽出：隐藏区段、待我表决的申请、前任署名判断，
 * 以及申请 / 表决两个接口调用。组件（`HistoryDisclosureNotice.vue` /
 * `ConversationHistoryVote.vue`）只负责摆位置与 emit，请求全在这里。
 *
 * 会话详情仍是**父组件的唯一真源**：这里不另存一份 detail，拿到新详情就交给
 * `applyDetail` 整体替换（父组件顺手 emit updated）。
 */

/** 区段状态文案：只有现任开发者视角下才会看到这些区段，客户侧恒为空数组。 */
export function historySegmentStateLabel(status: ConversationHistorySegment['status']) {
  if (status === 'pending') {
    return '等待双方确认'
  }
  if (status === 'rejected') {
    return '申请已被拒绝'
  }
  return '未公开'
}

type HistoryDisclosureSources = {
  token: string
  requirementId: string
  currentUsername?: string
  /** 父组件的会话详情（唯一真源），只读。 */
  conversation: RequirementConversation | null
  /** 拿到新详情：父组件整体替换 `detail` 并 emit `updated`。 */
  applyDetail: (detail: RequirementConversationDetail) => void
  /** 表决成功后重新拉一次详情（两票齐后那段消息会出现在时间线里）。 */
  reload: () => Promise<void>
}

export function useHistoryDisclosure(readSources: () => HistoryDisclosureSources) {
  const historyRequesting = ref(false)
  const historyVotingId = ref<number | null>(null)

  const hiddenSegments = computed(() =>
    (readSources().conversation?.history_segments ?? []).filter(
      (segment) => segment.status !== 'approved',
    ),
  )

  const canRequest = computed(() =>
    (readSources().conversation?.history_segments ?? []).some(
      (segment) => segment.status === 'hidden',
    ),
  )

  /** 我是这条申请里的哪一票：前任开发者票、客户票，都不是则不投（现任发起人不投票）。 */
  function myHistoryConsent(item: ConversationHistoryDisclosureBrief): ConversationConsent | null {
    const { currentUsername, conversation } = readSources()
    if (currentUsername === item.previous_developer) {
      return item.developer_consent
    }
    if (currentUsername === conversation?.customer) {
      return item.customer_consent
    }
    return null
  }

  /** 待我确认的公开申请：我是这段的前任开发者或客户，且自己那一票还没投。 */
  const pendingVotes = computed(() =>
    (readSources().conversation?.history_disclosures ?? []).filter(
      (item) => item.status === 'pending' && myHistoryConsent(item) === 'pending',
    ),
  )

  /** 被公开的历史区段里，非现任开发者发的开发者消息：署名标注，避免误认成当前负责人。 */
  function isPreviousDeveloperMessage(message: RequirementConversationMessage) {
    const conversation = readSources().conversation
    if (!conversation || message.sender_role !== 'developer') {
      return false
    }
    return message.sender !== conversation.developer
  }

  /** 现任开发者申请公开接手前的历史沟通（一次性覆盖所有还没申请的区段）。 */
  async function requestHistoryDisclosure() {
    const { token, requirementId, applyDetail } = readSources()
    if (!token || !requirementId || historyRequesting.value) {
      return
    }

    historyRequesting.value = true
    try {
      applyDetail(await requestRequirementHistoryDisclosure(token, requirementId))
      TMessage.success('已提交申请，等待前任开发者与客户确认')
    } catch (error) {
      TMessage.warning(error instanceof Error ? error.message : '申请查看历史沟通失败')
    } finally {
      historyRequesting.value = false
    }
  }

  async function respondHistoryDisclosure(
    item: ConversationHistoryDisclosureBrief,
    decision: 'approved' | 'rejected',
  ) {
    const { token, reload } = readSources()
    if (!token || historyVotingId.value !== null) {
      return
    }

    historyVotingId.value = item.id
    try {
      await respondConversationHistoryDisclosure(token, item.id, decision)
      TMessage.success(
        decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通',
      )
      // 两票齐后那段消息会出现在时间线里，重新拉一次详情即可看到
      await reload()
    } catch (error) {
      TMessage.warning(error instanceof Error ? error.message : '提交表决失败')
    } finally {
      historyVotingId.value = null
    }
  }

  return {
    hiddenSegments,
    canRequest,
    pendingVotes,
    historyRequesting,
    historyVotingId,
    myHistoryConsent,
    isPreviousDeveloperMessage,
    requestHistoryDisclosure,
    respondHistoryDisclosure,
  }
}
