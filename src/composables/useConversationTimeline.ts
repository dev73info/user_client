import { computed } from 'vue'

import type {
  RequirementConversation,
  RequirementConversationMessage,
} from '@/shared/conversations'
import {
  conversationCardMeta,
  conversationCardSide,
  type ConversationCardMeta,
  type ConversationCardSide,
} from '@/shared/conversationCards'
import { formatDateLabel, isMine, localDateKey } from '@/shared/conversationTime'

export type ConversationTimelineItem = {
  key: string
  kind: 'date' | 'message' | 'card'
  label?: string
  message?: RequirementConversationMessage
  mine?: boolean
  showAvatar?: boolean
  /** 被公开的历史消息里，非现任开发者发的：气泡上要署名「前任开发者」，避免误认成当前负责人。 */
  previousDeveloper?: boolean
  card?: ConversationCardMeta
  /** 卡片靠哪一侧：我方靠右、对方靠左、平台通知居中（见 conversationCardSide）。 */
  cardSide?: ConversationCardSide
  createdAt?: string
}

type TimelineSources = {
  messages: RequirementConversationMessage[]
  currentUsername?: string
  requirementId: string
  viewerRole: 'customer' | 'developer' | null
  conversation: RequirementConversation | null
}

/**
 * 把消息流摊成时间线：日期分隔条、状态变化卡片、普通气泡。
 *
 * 从 `RequirementConversationModal.vue` 抽出，纯派生、不含请求。原来由父组件传给
 * `ConversationMessageStream` 的「是不是前任开发者」判断也并进来，摊平成一个布尔字段，
 * 子组件不必再接一个函数型 prop。
 */
export function useConversationTimeline(readSources: () => TimelineSources) {
  const timelineItems = computed<ConversationTimelineItem[]>(() => {
    const { messages, currentUsername, requirementId, viewerRole, conversation } = readSources()
    const rows: ConversationTimelineItem[] = []
    let previousDateKey = ''

    for (const [index, message] of messages.entries()) {
      const dateKey = localDateKey(message.created_at)
      const nextMessage = messages[index + 1]
      const nextDateKey = nextMessage ? localDateKey(nextMessage.created_at) : ''

      if (dateKey && dateKey !== previousDateKey) {
        rows.push({
          key: `date-${dateKey}-${message.id}`,
          kind: 'date',
          label: formatDateLabel(message.created_at),
        })
        previousDateKey = dateKey
      }

      const mine = isMine(message, currentUsername)
      // 平台写入的状态变化卡片：靠哪一侧由后端记下的发起方决定——这一步是我做的靠我这边、
      // 对方做的靠对方那边，纯平台通知（结单、客服裁决、超时兜底）居中。
      // 未知事件码退化成普通消息，避免丢信息。
      // 需要需求当前状态，历史卡片的按钮才不会停在已经过去的步骤上（如定金缴完还挂着「支付定金」）。
      const card =
        message.message_type === 'card'
          ? conversationCardMeta(
              message.action_type ?? '',
              requirementId,
              viewerRole,
              conversation?.requirement_status ?? null,
              message.action_ref,
            )
          : null
      if (card) {
        rows.push({
          key: `card-${message.id}`,
          kind: 'card',
          card,
          cardSide: conversationCardSide(message.actor_role, viewerRole),
          message,
          createdAt: message.created_at,
        })
        continue
      }
      rows.push({
        key: `message-${message.id}`,
        kind: 'message',
        message,
        mine,
        showAvatar:
          !mine &&
          (!nextMessage || nextMessage.sender !== message.sender || nextDateKey !== dateKey),
        previousDeveloper: Boolean(
          conversation &&
          message.sender_role === 'developer' &&
          message.sender !== conversation.developer,
        ),
      })
    }

    return rows
  })

  return { timelineItems }
}
