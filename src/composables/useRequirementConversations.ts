import { computed, ref, type Ref } from 'vue'

import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import type { RequirementItem } from '@/api/requirements'
import {
  formatRequirementTime,
  hasBoundResource,
  requirementTimeValue,
} from '@/composables/useRequirementOverview'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/** 「最近沟通」面板最多摆几张卡。 */
const RECENT_CARD_LIMIT = 3

/**
 * 「最近沟通」的一张卡：展示串已经算好，面板只摆位置、点了把这张卡原样回传。
 * 不把整条 `RequirementItem` 甩给面板：卡片上就这三样，弹窗要的也是这三样。
 */
export type RequirementConversationCard = {
  requirementId: string
  title: string
  /** 副行：最近一次沟通的时间，或「打开会话后开始沟通」这类提示。 */
  meta: string
}

/**
 * 总览页的会话域：会话 map、三种派生（能不能聊 / 读数条那格 / 最近三张卡）与排序。
 * 接进来的是 `useRequirementOverview` 的 `myRequirements`——**必须是同一个实例**，
 * 各自再取一份列表，「哪些需求有会话可聊」就会与读数条对不上。
 */
export function useRequirementConversations(options: { requirements: Ref<RequirementItem[]> }) {
  const auth = useAuthStore()

  const requirementConversationMap = ref<Record<string, RequirementConversation>>({})

  function conversationForRequirement(item: RequirementItem) {
    return requirementConversationMap.value[item.requirement_id] ?? null
  }

  /** 会话排序口径：有消息按最后一条消息，没消息退回需求本身的更新时间。 */
  function conversationTimeValue(item: RequirementItem) {
    const conversation = conversationForRequirement(item)
    return requirementTimeValue(conversation?.last_message_at ?? item.updated_at)
  }

  function conversationLastMessageText(item: RequirementItem) {
    const conversation = conversationForRequirement(item)
    if (!conversation) {
      return '打开会话后开始沟通'
    }

    if (!conversation.last_message_at) {
      return '会话已创建，暂无消息'
    }

    return `最近沟通：${formatRequirementTime(conversation.last_message_at)}`
  }

  /** 能聊的需求：绑定了资源项目（有了合作对象才谈得上沟通）且会话没关；会话还没建出来的也算。 */
  const conversationCards = computed(() =>
    options.requirements.value.filter((item) => {
      if (!hasBoundResource(item)) {
        return false
      }

      return requirementConversationMap.value[item.requirement_id]?.status !== 'closed'
    }),
  )

  /** 读数条「会话」那格。 */
  const availableConversationCount = computed(() => conversationCards.value.length)

  const recentConversationCards = computed<RequirementConversationCard[]>(() =>
    [...conversationCards.value]
      .sort((left, right) => conversationTimeValue(right) - conversationTimeValue(left))
      .slice(0, RECENT_CARD_LIMIT)
      .map((item) => ({
        requirementId: item.requirement_id,
        title: item.title,
        meta: conversationLastMessageText(item),
      })),
  )

  async function loadRequirementConversations() {
    if (!auth.token.trim()) {
      requirementConversationMap.value = {}
      return
    }

    try {
      const conversations = await listRequirementConversations(auth.token)
      requirementConversationMap.value = Object.fromEntries(
        conversations.map((item) => [item.requirement_id, item]),
      )
    } catch (error) {
      requirementConversationMap.value = {}
      TMessage.error(error instanceof Error ? error.message : '加载沟通会话失败')
    }
  }

  /** 会话弹窗读写后回写单条会话：不必为了一次改动重取整份列表。 */
  function applyConversationDetail(payload: RequirementConversationDetail) {
    requirementConversationMap.value = {
      ...requirementConversationMap.value,
      [payload.conversation.requirement_id]: payload.conversation,
    }
  }

  return {
    availableConversationCount,
    recentConversationCards,
    loadRequirementConversations,
    applyConversationDetail,
  }
}
