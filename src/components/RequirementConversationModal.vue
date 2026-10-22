<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import type { RequirementConversationDetail } from '@/api/conversations'
import RequirementConversationActions from '@/components/RequirementConversationActions.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import ConversationComposer from '@/components/conversation/ConversationComposer.vue'
import ConversationHistoryVote from '@/components/conversation/ConversationHistoryVote.vue'
import ConversationMessageStream from '@/components/conversation/ConversationMessageStream.vue'
import ConversationModalHeader from '@/components/conversation/ConversationModalHeader.vue'
import RequirementDetailDrawer from '@/components/conversation/RequirementDetailDrawer.vue'
import { useConversationCardActions } from '@/composables/useConversationCardActions'
import { useConversationComposer } from '@/composables/useConversationComposer'
import { useConversationIdentity } from '@/composables/useConversationIdentity'
import { useConversationTimeline } from '@/composables/useConversationTimeline'
import { useHistoryDisclosure } from '@/composables/useHistoryDisclosure'
import { useRequirementConversationSession } from '@/composables/useRequirementConversationSession'
import { useRequirementDetailDrawer } from '@/composables/useRequirementDetailDrawer'

/**
 * 需求沟通会话（弹窗 / 内嵌两种形态）。
 *
 * 这里是会话的装配处：载入与实时、时间线、作曲器、卡片动作、历史沟通表决全部在各自的
 * composable 里，模板只把「会话头 / 时间线 / 业务入口条 / 作曲器 / 需求详情抽屉」摆好位置。
 * 详情仍是本组件的唯一真源（`useRequirementConversationSession` 持有），拿到新详情就 emit
 * `updated`；子组件不各存一份。
 */
const props = defineProps<{
  visible: boolean
  token: string
  requirementId: string
  title?: string
  currentUsername?: string
  apiMode?: 'user' | 'dev'
  displayMode?: 'modal' | 'inline'
}>()

const emit = defineEmits<{
  close: []
  updated: [detail: RequirementConversationDetail]
}>()

/** 时间线容器：滚动到底部要直接改它的 scrollTop。 */
const messageListRef = ref<HTMLElement | null>(null)
/** 底部工具条：卡片上的「验收 / 去交付」要借它打开弹窗。 */
const actionsRef = ref<InstanceType<typeof RequirementConversationActions> | null>(null)
/** 作曲器：发送成功后要收起它的表情面板。 */
const composerRef = ref<InstanceType<typeof ConversationComposer> | null>(null)
/**
 * 工具条能力快照。不能直接在模板里读 `actionsRef?.canAcceptDelivery`：
 * 那是子组件 expose 的 computed，父组件渲染时不会订阅它的内部依赖，
 * 子组件 `loadActions` 跑完后卡片按钮不会自己出现；下载时碰巧触发重渲染才偶发露出来。
 */
const actionCaps = reactive({
  canAcceptDelivery: false,
  canDeliver: false,
  canPay: false,
})

function onActionCapabilities(caps: {
  canAcceptDelivery: boolean
  canDeliver: boolean
  canPay: boolean
}) {
  actionCaps.canAcceptDelivery = caps.canAcceptDelivery
  actionCaps.canDeliver = caps.canDeliver
  actionCaps.canPay = caps.canPay
}

const {
  loading,
  errorMessage,
  realtimeStatus,
  realtimeError,
  requirementArchived,
  conversation,
  messages,
  conversationClosed,
  scrollToBottom,
  load,
  startRealtime,
  stopRealtime,
  resetReadMarker,
  applyDetail,
} = useRequirementConversationSession(() => ({
  token: props.token,
  requirementId: props.requirementId,
  visible: props.visible,
  onUpdated: (next) => emit('updated', next),
  scrollContainer: () => messageListRef.value,
}))

/**
 * 接手前的历史沟通（未公开区段、待我表决的申请、申请/表决接口）全在 useHistoryDisclosure 里。
 * 组件只摆位置、往外 emit；详情仍是 `useRequirementConversationSession` 里的唯一真源，
 * composable 拿到新详情就交给 applyDetail 整体替换（顺手 emit updated），不另存一份。
 */
const {
  hiddenSegments: hiddenHistorySegments,
  canRequest: canRequestHistory,
  pendingVotes: pendingHistoryVotes,
  historyRequesting,
  historyVotingId,
  requestHistoryDisclosure,
  respondHistoryDisclosure,
} = useHistoryDisclosure(() => ({
  token: props.token,
  requirementId: props.requirementId,
  currentUsername: props.currentUsername,
  conversation: conversation.value,
  applyDetail,
  reload: load,
}))

const {
  isInline,
  closeActionLabel,
  viewerRole,
  conversationTitle,
  headerPeerLabel,
  peerInitial,
  lastMessageLabel,
  realtimeStatusLabel,
} = useConversationIdentity(() => ({
  title: props.title,
  requirementId: props.requirementId,
  currentUsername: props.currentUsername,
  displayMode: props.displayMode,
  conversation: conversation.value,
  realtimeStatus: realtimeStatus.value,
}))

const { timelineItems } = useConversationTimeline(() => ({
  messages: messages.value,
  currentUsername: props.currentUsername,
  requirementId: props.requirementId,
  viewerRole: viewerRole.value,
  conversation: conversation.value,
}))

/** 作曲器是否被禁用：会话已关闭，或需求已进入到期归档的只读阶段。 */
const composerLocked = computed(() => conversationClosed.value || requirementArchived.value)

const {
  draft,
  sending,
  sendError,
  attachmentError,
  attachmentDraft,
  canSend,
  submitMessage,
  resetComposer,
  clearAttachmentDraft,
  applyAttachmentFile,
} = useConversationComposer(() => ({
  token: props.token,
  conversationId: conversation.value?.conversation_id,
  locked: composerLocked.value,
  archived: requirementArchived.value,
  loading: loading.value,
  onSent: applyDetail,
  closeEmojiPanel: () => composerRef.value?.closeEmojiPanel(),
  scrollToBottom,
}))

const { downloadLoading, runPaymentCardAction, runCardAction } = useConversationCardActions(() => ({
  token: props.token,
  requirementId: props.requirementId,
  canPay: actionCaps.canPay,
  requirementStatus: conversation.value?.requirement_status,
  actions: () => actionsRef.value,
}))

/**
 * 需求详情抽屉的开/关与取数（`apiMode === 'dev'` 走开发者侧列表）在 useRequirementDetailDrawer 里，
 * 这里只留一个 open 给会话头的「详情」按钮做高亮与 aria-expanded。
 */
const {
  drawerOpen: detailDrawerOpen,
  drawerLoading: detailDrawerLoading,
  drawerRequirement: detailDrawerRequirement,
  toggle: toggleDetailDrawer,
  close: closeDetailDrawer,
} = useRequirementDetailDrawer(() => props)

watch(
  () => [props.visible, props.token, props.requirementId] as const,
  ([visible]) => {
    stopRealtime()
    // 换了需求就重新开始报到已读：上一个会话报过的消息 id 与本会话无关
    resetReadMarker()
    if (visible) {
      void load()
      startRealtime()
      return
    }
    resetComposer()
    errorMessage.value = ''
  },
  { immediate: true },
)

/** 会话详情里的需求状态变了（验收通过 → 待付尾款等），工具条要跟着刷，支付 / 验收芯片才会对上卡片。 */
watch(
  () => conversation.value?.requirement_status,
  (status, previous) => {
    if (!status || status === previous || !props.visible) {
      return
    }
    void actionsRef.value?.loadActions?.()
  },
)

function closeModal() {
  if (sending.value) {
    return
  }
  detailDrawerOpen.value = false
  emit('close')
}

function handleBackdropClick() {
  if (!isInline.value) {
    closeModal()
  }
}
</script>

<template>
  <Teleport to="body" :disabled="isInline">
    <div
      v-if="visible"
      class="conversation-modal-wrap"
      :class="{ 'conversation-modal-wrap--inline': isInline }"
      @click.self="handleBackdropClick"
    >
      <section class="conversation-modal" aria-label="需求沟通会话">
        <!-- 内嵌形态在移动端把会话头搬进工作台顶栏（返回 · 标题 · 对方与状态 · 详情 · 刷新），
             省掉顶栏与会话头叠两行；桌面端与弹窗形态原地渲染 -->
        <WorkbenchBarSlot :disabled="!isInline">
          <ConversationModalHeader
            :close-action-label="closeActionLabel"
            :peer-initial="peerInitial"
            :conversation-title="conversationTitle"
            :peer-label="headerPeerLabel"
            :realtime-status="realtimeStatus"
            :realtime-error="realtimeError"
            :realtime-status-label="realtimeStatusLabel"
            :last-message-label="lastMessageLabel"
            :detail-open="detailDrawerOpen"
            :loading="loading"
            @close="closeModal"
            @toggle-detail="toggleDetailDrawer"
            @refresh="load"
          />
        </WorkbenchBarSlot>

        <div ref="messageListRef" class="conversation-modal__messages">
          <ConversationMessageStream
            :items="timelineItems"
            :loading="loading"
            :error-message="errorMessage"
            :message-count="messages.length"
            :hidden-segments="hiddenHistorySegments"
            :can-request-history="canRequestHistory"
            :history-requesting="historyRequesting"
            :download-loading="downloadLoading"
            :can-deliver="actionCaps.canDeliver"
            :can-accept-delivery="actionCaps.canAcceptDelivery"
            @retry="load"
            @request-history="requestHistoryDisclosure"
            @payment="runPaymentCardAction"
            @card-action="runCardAction"
            @deliver="actionsRef?.openDeliveryDialog()"
            @accept="actionsRef?.openAcceptanceDialog()"
          />
        </div>

        <!-- 待我确认的历史沟通公开申请：一条申请一条确认条，表决接口由 useHistoryDisclosure 调 -->
        <ConversationHistoryVote
          v-for="item in pendingHistoryVotes"
          :key="`history-vote-${item.id}`"
          :item="item"
          :voting="historyVotingId !== null"
          @vote="(decision) => respondHistoryDisclosure(item, decision)"
        />

        <!-- 业务入口（查看合同、解除合作、付款、交付……）放在输入底栏之外、紧贴其上方 -->
        <div v-if="viewerRole" class="conversation-modal__tools">
          <RequirementConversationActions
            ref="actionsRef"
            :token="token"
            :requirement-id="requirementId"
            :role="viewerRole"
            @changed="load"
            @capabilities="onActionCapabilities"
          />
        </div>

        <ConversationComposer
          ref="composerRef"
          :draft="draft"
          :sending="sending"
          :loading="loading"
          :locked="composerLocked"
          :conversation-closed="conversationClosed"
          :requirement-archived="requirementArchived"
          :can-send="canSend"
          :send-error="sendError"
          :attachment-error="attachmentError"
          :attachment="attachmentDraft"
          @update:draft="draft = $event"
          @submit="submitMessage"
          @attach-file="applyAttachmentFile"
          @clear-attachment="clearAttachmentDraft"
        />

        <!-- 需求详情抽屉：整块在 RequirementDetailDrawer 里（含 Teleport 到 body 的原因说明），
             开/关与取数在 useRequirementDetailDrawer；这里只把 token 拉到的结果传下去 -->
        <RequirementDetailDrawer
          :open="detailDrawerOpen"
          :loading="detailDrawerLoading"
          :requirement="detailDrawerRequirement"
          @close="closeDetailDrawer"
        />
      </section>
    </div>
  </Teleport>
</template>

<style scoped src="./conversation/conversation-modal-shell.css"></style>
