import { ref } from 'vue'

import {
  listRequirementConversations,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import type { RequirementItem } from '@/api/devRequirements'

import { TMessage } from 'ui_73info'

/**
 * 接单页行上那三个弹窗的编排：解除合作（售后）、沟通会话、评价。
 *
 * 三次「打开 → 关闭 → 联动」原先散在页面里，各有一对 `visible` / `target`，
 * 现在收在一处；页面只判「能不能出这个入口」（`canOpenAfterSales` / `canComment`），
 * 打开之后的状态与请求都在这里。交付版本与违约申报不在其中：
 * 前者是 `DeliverySubmitDialog` 的单值入口，后者由 `useBreachCase` 编排。
 *
 * 会话摘要（`conversationStatusLabel`）也一并放这儿——卡上的「会话」格子读的就是它，
 * 与弹窗里发出的「已创建会话」是同一份记录，不该各存一份。
 * 登录身份由页面注入，composable 自己不去 store 里取。
 *
 * 需求方侧的 `useRequirementRowDialogs` 是另一套（会话 / 获取发票 / 转为我的资源），
 * 两页的入口与请求都不一样，不合并成一个。
 */
export function useDevRequirementRowDialogs(options: { token: () => string }) {
  /* === 解除合作（售后） === */
  const afterSalesVisible = ref(false)
  const afterSalesTarget = ref<RequirementItem | null>(null)

  function openAfterSales(item: RequirementItem) {
    afterSalesTarget.value = item
    afterSalesVisible.value = true
  }

  function closeAfterSales() {
    afterSalesVisible.value = false
    afterSalesTarget.value = null
  }

  /* === 沟通会话 === */
  const conversationVisible = ref(false)
  const conversationTarget = ref<RequirementItem | null>(null)
  const conversationLoading = ref(false)
  const conversationMap = ref<Record<string, RequirementConversation>>({})

  function openConversation(item: RequirementItem) {
    conversationTarget.value = item
    conversationVisible.value = true
  }

  function closeConversation() {
    conversationVisible.value = false
  }

  /** 弹窗里发出消息后回填摘要：卡上的「最近：…」据此更新，不用整页重取。 */
  function applyConversationDetail(payload: RequirementConversationDetail) {
    conversationMap.value = {
      ...conversationMap.value,
      [payload.conversation.requirement_id]: payload.conversation,
    }
  }

  function conversationForRequirement(item: RequirementItem) {
    return conversationMap.value[item.requirement_id] ?? null
  }

  function conversationStatusLabel(item: RequirementItem) {
    const conversation = conversationForRequirement(item)
    if (!conversation) {
      return '打开后创建会话'
    }
    return conversation.last_message_at ? `最近：${conversation.last_message_at}` : '暂无消息'
  }

  /** 会话摘要与需求单一起取回：拉不到就按「没有会话」显示，不阻塞列表。 */
  async function loadConversations() {
    const token = options.token()
    if (!token) {
      conversationMap.value = {}
      return
    }

    conversationLoading.value = true
    try {
      const conversations = await listRequirementConversations(token)
      conversationMap.value = Object.fromEntries(
        conversations.map((item) => [item.requirement_id, item]),
      )
    } catch (error) {
      conversationMap.value = {}
      TMessage.error(error instanceof Error ? error.message : '加载沟通会话失败')
    } finally {
      conversationLoading.value = false
    }
  }

  /* === 评价 === */
  const commentVisible = ref(false)
  const commentTarget = ref<RequirementItem | null>(null)

  function openComment(item: RequirementItem) {
    commentTarget.value = item
    commentVisible.value = true
  }

  function closeComment() {
    commentVisible.value = false
    commentTarget.value = null
  }

  return {
    afterSalesVisible,
    afterSalesTarget,
    openAfterSales,
    closeAfterSales,
    conversationVisible,
    conversationTarget,
    conversationLoading,
    openConversation,
    closeConversation,
    applyConversationDetail,
    conversationStatusLabel,
    loadConversations,
    commentVisible,
    commentTarget,
    openComment,
    closeComment,
  }
}
