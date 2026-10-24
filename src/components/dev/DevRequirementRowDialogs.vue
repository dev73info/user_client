<script setup lang="ts">
import AfterSalesModal from '@/components/AfterSalesModal.vue'
import RequirementCommentDialog from '@/components/RequirementCommentDialog.vue'
import RequirementConversationModal from '@/components/RequirementConversationModal.vue'
import type { RequirementConversationDetail } from '@/api/conversations'
import type { RequirementItem } from '@/api/devRequirements'

/**
 * 接单页那三个「按行打开」的弹窗收在一处挂载：解除合作（售后）、沟通会话、评价。
 *
 * 原先三个弹窗各占页面模板一段、各带一对 `visible` / `target`，加一个入口就要在三处补状态。
 * 现在页面只留一个挂点，状态与请求在 `useDevRequirementRowDialogs` 里，这里只把状态铺成 props、
 * 把子弹窗的事件接成 emits——「这一单能不能打开」由页面判，组件不自己查。
 *
 * 交付版本（`DeliverySubmitDialog`）与违约申报（`RequirementBreachDialog`）不在这里：
 * 前者由本页直接挂，后者跟着 `useRequirementBreach` 的编排走。
 */
defineProps<{
  token: string
  username: string
  afterSalesVisible: boolean
  afterSalesTarget: RequirementItem | null
  conversationVisible: boolean
  conversationTarget: RequirementItem | null
  commentVisible: boolean
  commentTarget: RequirementItem | null
}>()

const emit = defineEmits<{
  closeAfterSales: []
  closeConversation: []
  /** 会话里发出消息后回填摘要（卡上的「最近：…」跟着更新）。 */
  conversationUpdated: [payload: RequirementConversationDetail]
  closeComment: []
  /** 评价提交成功：页面重取列表，卡上的星级与评语一起变。 */
  commentSubmitted: []
}>()
</script>

<template>
  <AfterSalesModal
    :visible="afterSalesVisible"
    :token="token"
    :current-username="username"
    :requirement-id="afterSalesTarget?.requirement_id ?? ''"
    :requirement-title="afterSalesTarget?.title ?? ''"
    :can-open-case="false"
    @close="emit('closeAfterSales')"
  />

  <RequirementConversationModal
    :visible="conversationVisible"
    api-mode="dev"
    :token="token"
    :current-username="username"
    :requirement-id="conversationTarget?.requirement_id ?? ''"
    :title="conversationTarget?.title"
    @updated="emit('conversationUpdated', $event)"
    @close="emit('closeConversation')"
  />

  <RequirementCommentDialog
    :visible="commentVisible && !!commentTarget"
    :token="token"
    :requirement-id="commentTarget?.requirement_id ?? ''"
    :title="commentTarget?.title ?? ''"
    :initial-rating="commentTarget?.developer_comment_rating ?? null"
    :initial-text="commentTarget?.developer_comment_text ?? null"
    @close="emit('closeComment')"
    @submitted="emit('commentSubmitted')"
  />
</template>
