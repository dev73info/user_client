<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  TButton,
  TIcon,
  ArrowLeft,
  Bell,
  ChatDotRound,
  Close,
  Document,
  MagicStick,
  Paperclip,
  Picture,
  Position,
  Refresh,
  TMessage,
} from 'ui_73info'

import * as userConversationApi from '@/api/conversations'
import * as devConversationApi from '@/api/conversations'
import type {
  ConversationConsent,
  ConversationHistoryDisclosureBrief,
  ConversationHistorySegment,
  RequirementConversationDetail,
  RequirementConversationMessage,
} from '@/api/conversations'
import { fetchAsignRequirementPreviewUrl } from '@/api/contracts'
import { apiUrl } from '@/api/http'
import { fetchRequirementDetail, listRequirements, type RequirementPaymentMode } from '@/api/requirements'
import { listMyRequirements } from '@/api/devRequirements'
import {
  formatCnDateTime,
  formatCny,
  requirementPaymentModeLabel,
} from '@/shared/requirementDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { isRequirementArchived } from '@/shared/requirementArchive'
import { dispatchConversationRead } from '@/shared/conversationEvents'
import { sanitizeRequirementRichText } from '@/utils/requirementRichText'
import { listPublicMcResourceVersions } from '@/api/resources'
import RequirementConversationActions from '@/components/RequirementConversationActions.vue'
import WorkbenchBarSlot from '@/components/WorkbenchBarSlot.vue'
import {
  conversationCardMeta,
  conversationCardSide,
  type ConversationCardMeta,
  type ConversationCardSide,
} from '@/shared/conversationCards'

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

const detail = ref<RequirementConversationDetail | null>(null)
const loading = ref(false)
const sending = ref(false)
const draft = ref('')
const errorMessage = ref('')
const attachmentError = ref('')
const downloadLoading = ref(false)
const emojiPanelOpen = ref(false)
const draftInputRef = ref<HTMLTextAreaElement | null>(null)

/* 输入框随内容长高，封顶 4 行后改为框内滚动；样式表里的固定高度只是单行时的起点，
   不跟着撑高的话换行后前面的字和光标都会被裁掉。 */
const DRAFT_MAX_LINES = 4
function resizeDraftInput() {
  const el = draftInputRef.value
  if (!el) return
  el.style.height = ''
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22
  const maxHeight = lineHeight * DRAFT_MAX_LINES
  const next = Math.min(el.scrollHeight, maxHeight)
  el.style.height = `${next}px`
  el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
}

watch(draft, () => nextTick(resizeDraftInput))
const attachmentInputRef = ref<HTMLInputElement | null>(null)
const attachmentDraft = ref<ConversationAttachmentDraft | null>(null)
const messageListRef = ref<HTMLElement | null>(null)
/** 底部工具条：卡片上的「验收」按钮要向它问「现在能不能验收」，并借它打开验收弹窗。 */
const actionsRef = ref<InstanceType<typeof RequirementConversationActions> | null>(null)
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
const realtimeStatus = ref<RealtimeStatus>('idle')
const realtimeError = ref('')
const historyRequesting = ref(false)
const historyVotingId = ref<number | null>(null)
let stopRealtimeEvents: (() => void) | null = null
/** 已成功上报过已读的最大消息 id：同一个位置不重复请求（见 reportConversationRead）。 */
const lastReportedReadId = ref(0)

type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

type ConversationAttachmentDraft = {
  file: File
  previewUrl: string
  name: string
  mimeType: string
  sizeLabel: string
}

type ConversationTimelineItem = {
  key: string
  kind: 'date' | 'message' | 'card'
  label?: string
  message?: RequirementConversationMessage
  mine?: boolean
  showAvatar?: boolean
  card?: ConversationCardMeta
  /** 卡片靠哪一侧：我方靠右、对方靠左、平台通知居中（见 conversationCardSide）。 */
  cardSide?: ConversationCardSide
  createdAt?: string
}

type ConversationApi = {
  getRequirementConversationByRequirement: typeof userConversationApi.getRequirementConversationByRequirement
  sendRequirementConversationMessage: typeof userConversationApi.sendRequirementConversationMessage
  requestRequirementHistoryDisclosure: typeof userConversationApi.requestRequirementHistoryDisclosure
  respondConversationHistoryDisclosure: typeof userConversationApi.respondConversationHistoryDisclosure
  markRequirementConversationRead: typeof userConversationApi.markRequirementConversationRead
  subscribeRequirementConversationEvents: typeof userConversationApi.subscribeRequirementConversationEvents
}

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const emojiOptions = [
  '😀',
  '😄',
  '😊',
  '😉',
  '👍',
  '👌',
  '🙏',
  '🤝',
  '🎉',
  '✨',
  '🔥',
  '💡',
  '📌',
  '✅',
  '❗',
  '👀',
]

const conversationApi = computed<ConversationApi>(() =>
  props.apiMode === 'dev' ? devConversationApi : userConversationApi,
)
const router = useRouter()
const conversation = computed(() => detail.value?.conversation ?? null)
const messages = computed(() => detail.value?.messages ?? [])
const conversationClosed = computed(
  () => conversation.value?.status === 'closed',
)
/**
 * R014：需求是否已进入「合同有效期届满的锁定 / 已清除」阶段。
 *
 * 归档后会话只读（后端也会拒写），历史消息与附件仍可看、可下载。标记从需求详情读一次
 * （读取即触发后端收口）；读不到时不拦，与全平台旁路判定口径一致。
 */
const requirementArchived = ref(false)
/** 作曲器是否被禁用：会话已关闭，或需求已进入到期归档的只读阶段。 */
const composerLocked = computed(() => conversationClosed.value || requirementArchived.value)
const canSend = computed(
  () =>
    (draft.value.trim().length > 0 || Boolean(attachmentDraft.value)) &&
    !sending.value &&
    !loading.value &&
    !composerLocked.value,
)
const isInline = computed(() => props.displayMode === 'inline')
const closeActionLabel = computed(() => (isInline.value ? '返回列表' : '关闭'))
/**
 * 接手前的历史沟通区段：只有现任开发者视角下才有值（客户不受隐藏限制、后端返回空数组）。
 * 已公开的那几段消息会直接回到时间线里，因此只提示仍未公开的部分。
 */
const hiddenHistorySegments = computed(() =>
  (conversation.value?.history_segments ?? []).filter((segment) => segment.status !== 'approved'),
)
const canRequestHistory = computed(() =>
  (conversation.value?.history_segments ?? []).some((segment) => segment.status === 'hidden'),
)
const hiddenHistoryDevelopers = computed(() =>
  [...new Set(hiddenHistorySegments.value.map((segment) => segment.previous_developer))].join('、'),
)
/** 待我确认的公开申请：我是这段的前任开发者或客户，且自己那一票还没投。 */
const pendingHistoryVotes = computed(() =>
  (conversation.value?.history_disclosures ?? []).filter(
    (item) => item.status === 'pending' && myHistoryConsent(item) === 'pending',
  ),
)
/** 当前登录用户在这条会话里的角色：需求方（甲方）或开发者（乙方）。 */
const viewerRole = computed<'customer' | 'developer' | null>(() => {
  const item = conversation.value
  const username = props.currentUsername
  if (!item || !username) {
    return null
  }
  if (item.customer === username) {
    return 'customer'
  }
  if (item.developer === username) {
    return 'developer'
  }
  return null
})
const conversationTitle = computed(
  () => props.title || conversation.value?.requirement_title || '需求沟通',
)
const participantLabel = computed(() => {
  const item = conversation.value
  if (!item) {
    return ''
  }

  if (props.currentUsername === item.customer) {
    return `开发者：${item.developer}`
  }
  if (props.currentUsername === item.developer) {
    return `用户：${item.customer}`
  }
  return `${item.customer} / ${item.developer}`
})
const peerName = computed(() => {
  const item = conversation.value
  if (!item) {
    return '会话'
  }

  if (props.currentUsername === item.customer) {
    return item.developer
  }
  if (props.currentUsername === item.developer) {
    return item.customer
  }
  return item.developer || item.customer || '会话'
})
const peerInitial = computed(() => avatarText(peerName.value))
const lastMessageLabel = computed(() => {
  const item = conversation.value
  if (!item?.last_message_at) {
    return '尚无消息'
  }
  return `最近 ${formatFullDateTime(item.last_message_at)}`
})
const realtimeStatusLabel = computed(() => {
  if (realtimeStatus.value === 'connected') {
    return '实时同步中'
  }
  if (realtimeStatus.value === 'error') {
    return '实时重连中'
  }
  if (realtimeStatus.value === 'connecting') {
    return '实时连接中'
  }
  return '实时待连接'
})
const timelineItems = computed<ConversationTimelineItem[]>(() => {
  const rows: ConversationTimelineItem[] = []
  let previousDateKey = ''

  const sourceMessages = messages.value

  for (const [index, message] of sourceMessages.entries()) {
    const dateKey = localDateKey(message.created_at)
    const nextMessage = sourceMessages[index + 1]
    const nextDateKey = nextMessage ? localDateKey(nextMessage.created_at) : ''

    if (dateKey && dateKey !== previousDateKey) {
      rows.push({
        key: `date-${dateKey}-${message.id}`,
        kind: 'date',
        label: formatDateLabel(message.created_at),
      })
      previousDateKey = dateKey
    }

    const mine = isMine(message)
    // 平台写入的状态变化卡片：靠哪一侧由后端记下的发起方决定——这一步是我做的靠我这边、
    // 对方做的靠对方那边，纯平台通知（结单、客服裁决、超时兜底）居中。
    // 未知事件码退化成普通消息，避免丢信息。
    // 需要需求当前状态，历史卡片的按钮才不会停在已经过去的步骤上（如定金缴完还挂着「支付定金」）。
    const card =
      message.message_type === 'card'
        ? conversationCardMeta(
            message.action_type ?? '',
            props.requirementId,
            viewerRole.value,
            conversation.value?.requirement_status ?? null,
            message.action_ref,
          )
        : null
    if (card) {
      rows.push({
        key: `card-${message.id}`,
        kind: 'card',
        card,
        cardSide: conversationCardSide(message.actor_role, viewerRole.value),
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
        !mine && (!nextMessage || nextMessage.sender !== message.sender || nextDateKey !== dateKey),
    })
  }

  return rows
})

watch(
  () => [props.visible, props.token, props.requirementId, props.apiMode] as const,
  ([visible]) => {
    stopRealtime()
    // 换了需求就重新开始报到已读：上一个会话报过的消息 id 与本会话无关
    lastReportedReadId.value = 0
    if (visible) {
      void loadConversation()
      startRealtime()
      return
    }
    resetComposer()
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

onBeforeUnmount(() => {
  stopRealtime()
  clearAttachmentDraft()
})

/**
 * 滚到时间线最底部（最新一条）。
 *
 * ponytail: 只滚一次，不做「贴底跟随」。作曲器里的提示文案与快捷操作晚一两帧才定型，
 * 消息区被挤矮后这次滚动会差最后几十像素（最多遮住最新卡片的底边），要彻底钉住底部
 * 得上 ResizeObserver；目前差量在可视范围内，先不引入。 */
async function scrollToBottom() {
  await nextTick()
  if (messageListRef.value) {
    messageListRef.value.scrollTop = messageListRef.value.scrollHeight
  }
}

/**
 * 执行卡片按钮：爱签合同预览优先（点进去即可查看/签署），取不到链接再回退站内路由。
 *
 * 与需求列表页「查看合同」同一口径：合同还没在爱签侧发起签署、或爱签接口异常时，
 * 接口会报错，这里静默回退到本地签约页。
 */
/**
 * 卡片上的「支付定金 / 支付尾款」：能付就打开工具条弹窗；
 * 验收打回后退回「开发中」时入口仍留在「验收已通过」卡片上，点下去说明要先重新验收通过。
 */
function runPaymentCardAction() {
  if (actionCaps.canPay) {
    actionsRef.value?.openPayDialog?.()
    return
  }
  const status = conversation.value?.requirement_status
  if (status === 'in_development') {
    TMessage.warning('验收已打回开发中，请重新验收通过后再支付尾款')
    return
  }
  TMessage.warning('当前还不能支付，请确认合同已签署且需求处于待缴定金或待付尾款')
}

async function runCardAction(card: ConversationCardMeta, message?: RequirementConversationMessage) {
  if (card.downloadDelivery) {
    await downloadDeliveryArtifact(message?.action_ref ?? '')
    return
  }
  if (card.asignPreview) {
    try {
      const previewUrl = await fetchAsignRequirementPreviewUrl(props.token, props.requirementId)
      if (previewUrl) {
        window.location.href = previewUrl
        return
      }
    } catch {
      // 忽略：回退站内合同页
    }
  }
  if (card.to) {
    await router.push(card.to)
  }
}

/**
 * 下载交付产物：交付即「绑定资源项目的一次版本发布」，卡片上的 ref 是那次交付的版本号。
 * 版本号对不上（例如卡片之后又发过新版本）时退回最新版本；没有绑定资源或还没发版本就只提示。
 */
async function downloadDeliveryArtifact(versionRef: string) {
  if (downloadLoading.value || !props.token || !props.requirementId) {
    return
  }

  downloadLoading.value = true
  try {
    const requirements = await listRequirements(props.token)
    const boundResourceId = requirements.find(
      (row) => row.requirement_id === props.requirementId,
    )?.bound_resource_id
    if (boundResourceId == null) {
      TMessage.warning('该需求还没有绑定的交付资源，暂时没有可下载的产物')
      return
    }

    const versions = await listPublicMcResourceVersions(boundResourceId, props.token)
    const target = versions.find((item) => item.version === versionRef) ?? versions[0]
    if (!target) {
      TMessage.warning('开发者还没有提交交付版本')
      return
    }

    window.open(apiUrl(target.resource), '_blank', 'noopener')
    // 下载已证明有交付版本：刷一遍工具条，并用刚查到的版本数兜底，让同卡「验收」立刻可点。
    await actionsRef.value?.loadActions?.()
    actionsRef.value?.applyPublishedVersionCount?.(versions.length)
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '下载交付产物失败')
  } finally {
    downloadLoading.value = false
  }
}

async function loadConversation() {
  if (!props.token || !props.requirementId) {
    return
  }

  loading.value = true
  errorMessage.value = ''
  try {
    detail.value = await conversationApi.value.getRequirementConversationByRequirement(
      props.token,
      props.requirementId,
    )
    emit('updated', detail.value)
    void reportConversationRead()
    // R014：读一次需求详情拿「超期锁定 / 已清除」标记（读取即触发后端收口）。失败不阻断会话。
    try {
      const item = await fetchRequirementDetail(props.token, props.requirementId)
      requirementArchived.value = isRequirementArchived(item)
    } catch {
      requirementArchived.value = false
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载会话失败'
    detail.value = null
  } finally {
    loading.value = false
  }
  // 必须等 loading 关掉之后再滚：加载态里消息列表被「会话加载中」占位块取代，容器没有
  // 可滚动高度，此时赋值 scrollTop 会被浏览器夹回 0，数据回来后就停在时间线最上面，
  // 最新的卡片（如结单）要手动往下滚才看得见。
  await scrollToBottom()
}

/**
 * 上报已读：打开会话、断线补拉、以及实时收到新消息之后各报一次。
 *
 * 报的是「我这侧的已读位置」，所以用已成功上报过的最大消息 id 去重——同一个位置不重复请求，
 * 只有收到更新的消息时才再报一次。成败都不打扰用户：失败时下次进会话或下一条消息会再报，
 * 且「未读角标」始终以服务端为准，报失败不会把角标算少。
 */
async function reportConversationRead() {
  const item = conversation.value
  const newest = messages.value[messages.value.length - 1]
  if (!props.token || !item || !newest || newest.id <= lastReportedReadId.value) {
    return
  }

  try {
    await conversationApi.value.markRequirementConversationRead(props.token, item.conversation_id)
    lastReportedReadId.value = newest.id
    // 角标挂在工作台外壳、会话列表挂在这一页上，两者都不在父子链上，只能广播
    dispatchConversationRead({
      conversationId: item.conversation_id,
      requirementId: item.requirement_id,
    })
  } catch {
    // 上报失败不打扰用户：下次打开会话或下一条消息会再报一次
  }
}

/**
 * 断线重连后补一次全量：实时流只推「连上之后」发生的事件，断线期间平台写入的卡片
 * 与双方消息都不会补发，不重拉就会一直停在上次连上那一刻（例如结单卡片始终不出现）。
 * 与 loadConversation 的区别是不置 loading，避免把正在看的时间线换成加载态、顺手禁掉输入框。
 */
async function syncAfterRealtimeReconnect() {
  if (!props.token || !props.requirementId) {
    return
  }

  try {
    const next = await conversationApi.value.getRequirementConversationByRequirement(
      props.token,
      props.requirementId,
    )
    detail.value = next
    emit('updated', next)
    void reportConversationRead()
    await scrollToBottom()
  } catch {
    // 补拉失败不打扰用户：下一次重连或手动刷新会再试
  }
}

function applyRealtimeDetail(payload: RequirementConversationDetail) {
  if (payload.conversation.requirement_id !== props.requirementId) {
    return
  }

  detail.value = payload
  emit('updated', payload)
  void reportConversationRead()
  void scrollToBottom()
}

/** 我是这条申请里的哪一票：前任开发者票、客户票，都不是则不投（现任发起人不投票）。 */
function myHistoryConsent(item: ConversationHistoryDisclosureBrief): ConversationConsent | null {
  if (props.currentUsername === item.previous_developer) {
    return item.developer_consent
  }
  if (props.currentUsername === conversation.value?.customer) {
    return item.customer_consent
  }
  return null
}

function historySegmentStateLabel(status: ConversationHistorySegment['status']) {
  if (status === 'pending') {
    return '等待双方确认'
  }
  if (status === 'rejected') {
    return '申请已被拒绝'
  }
  return '未公开'
}

/** 被公开的历史区段里，非现任开发者发的开发者消息：署名标注，避免误认成当前负责人。 */
function isPreviousDeveloperMessage(message: RequirementConversationMessage) {
  const item = conversation.value
  if (!item || message.sender_role !== 'developer') {
    return false
  }
  return message.sender !== item.developer
}

/** 现任开发者申请公开接手前的历史沟通（一次性覆盖所有还没申请的区段）。 */
async function requestHistoryDisclosure() {
  if (!props.token || !props.requirementId || historyRequesting.value) {
    return
  }

  historyRequesting.value = true
  try {
    detail.value = await conversationApi.value.requestRequirementHistoryDisclosure(
      props.token,
      props.requirementId,
    )
    emit('updated', detail.value)
    TMessage.success('已提交申请，等待前任开发者与客户确认')
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '申请查看历史沟通失败')
  } finally {
    historyRequesting.value = false
  }
}

async function respondHistoryDisclosure(item: ConversationHistoryDisclosureBrief, decision: 'approved' | 'rejected') {
  if (!props.token || historyVotingId.value !== null) {
    return
  }

  historyVotingId.value = item.id
  try {
    await conversationApi.value.respondConversationHistoryDisclosure(props.token, item.id, decision)
    TMessage.success(decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通')
    // 两票齐后那段消息会出现在时间线里，重新拉一次详情即可看到
    await loadConversation()
  } catch (error) {
    TMessage.warning(error instanceof Error ? error.message : '提交表决失败')
  } finally {
    historyVotingId.value = null
  }
}

function startRealtime() {
  if (!props.token || !props.requirementId) {
    realtimeStatus.value = 'idle'
    return
  }

  realtimeStatus.value = 'connecting'
  realtimeError.value = ''
  stopRealtimeEvents = conversationApi.value.subscribeRequirementConversationEvents(props.token, {
    onUpdate: applyRealtimeDetail,
    onOpen: () => {
      realtimeStatus.value = 'connected'
      realtimeError.value = ''
    },
    onReconnect: () => {
      // 断线期间可能已经写入卡片/消息，重连后补拉一次，避免时间线停在断线前的样子
      void syncAfterRealtimeReconnect()
    },
    onClose: () => {
      if (props.visible && props.token) {
        realtimeStatus.value = 'connecting'
      }
    },
    onError: (error) => {
      realtimeStatus.value = 'error'
      realtimeError.value = error.message
    },
  })
}

function stopRealtime() {
  if (stopRealtimeEvents) {
    stopRealtimeEvents()
    stopRealtimeEvents = null
  }
  realtimeStatus.value = 'idle'
  realtimeError.value = ''
}

async function submitMessage() {
  if (sending.value || loading.value || composerLocked.value) {
    if (requirementArchived.value) {
      TMessage.warning('合同有效期已届满，会话在资料保留期内只读：不能发消息或传附件，历史内容仍可查看与下载')
    }
    return
  }

  const content = draft.value.trim()
  const activeAttachment = attachmentDraft.value
  const activeConversation = conversation.value
  if ((!content && !activeAttachment) || !activeConversation || !props.token) {
    return
  }

  sending.value = true
  errorMessage.value = ''
  attachmentError.value = ''
  try {
    detail.value = await conversationApi.value.sendRequirementConversationMessage(
      props.token,
      activeConversation.conversation_id,
      content,
      activeAttachment?.file,
    )
    emit('updated', detail.value)
    if (draft.value.trim() === content) {
      draft.value = ''
    }
    if (activeAttachment && attachmentDraft.value?.previewUrl === activeAttachment.previewUrl) {
      clearAttachmentDraft()
    }
    emojiPanelOpen.value = false
    await scrollToBottom()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '发送消息失败'
  } finally {
    sending.value = false
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter' || event.shiftKey) {
    return
  }

  event.preventDefault()
  void submitMessage()
}

function resetComposer() {
  draft.value = ''
  errorMessage.value = ''
  attachmentError.value = ''
  emojiPanelOpen.value = false
  clearAttachmentDraft()
}

function clearAttachmentDraft() {
  if (attachmentDraft.value) {
    URL.revokeObjectURL(attachmentDraft.value.previewUrl)
  }
  attachmentDraft.value = null
}

function toggleEmojiPanel() {
  if (sending.value || loading.value || conversationClosed.value) {
    return
  }
  emojiPanelOpen.value = !emojiPanelOpen.value
}

function insertEmoji(emoji: string) {
  const input = draftInputRef.value
  if (!input) {
    draft.value = `${draft.value}${emoji}`
    return
  }

  const selectionStart = input.selectionStart ?? draft.value.length
  const selectionEnd = input.selectionEnd ?? selectionStart
  draft.value = `${draft.value.slice(0, selectionStart)}${emoji}${draft.value.slice(selectionEnd)}`

  void nextTick(() => {
    input.focus()
    const cursorPosition = selectionStart + emoji.length
    input.setSelectionRange(cursorPosition, cursorPosition)
  })
}

function openAttachmentPicker() {
  if (sending.value || loading.value || conversationClosed.value) {
    return
  }
  attachmentInputRef.value?.click()
}

function handleAttachmentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    applyAttachmentFile(file)
  }
  input.value = ''
}

function handleComposerPaste(event: ClipboardEvent) {
  const file = findClipboardImage(event.clipboardData)
  if (!file) {
    return
  }

  event.preventDefault()
  applyAttachmentFile(file)
}

function findClipboardImage(data: DataTransfer | null) {
  if (!data) {
    return null
  }

  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }

  for (const file of Array.from(data.files)) {
    if (file.type.startsWith('image/')) {
      return file
    }
  }

  return null
}

function applyAttachmentFile(file: File) {
  const mimeType = file.type || mimeTypeFromName(file.name)
  if (!mimeType.startsWith('image/')) {
    attachmentError.value = '仅支持图片附件'
    return
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    attachmentError.value = '图片不能超过 8MB'
    return
  }

  clearAttachmentDraft()
  const name = file.name?.trim() || defaultAttachmentName(mimeType)
  const uploadFile = file.name?.trim() ? file : new File([file], name, { type: mimeType })
  attachmentDraft.value = {
    file: uploadFile,
    previewUrl: URL.createObjectURL(uploadFile),
    name,
    mimeType,
    sizeLabel: formatBytes(uploadFile.size),
  }
  attachmentError.value = ''
}

function mimeTypeFromName(name: string) {
  const lowerName = name.toLowerCase()
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (lowerName.endsWith('.webp')) {
    return 'image/webp'
  }
  if (lowerName.endsWith('.gif')) {
    return 'image/gif'
  }
  if (lowerName.endsWith('.png')) {
    return 'image/png'
  }
  return ''
}

function defaultAttachmentName(mimeType: string) {
  if (mimeType === 'image/jpeg') {
    return 'screenshot.jpg'
  }
  if (mimeType === 'image/webp') {
    return 'screenshot.webp'
  }
  if (mimeType === 'image/gif') {
    return 'screenshot.gif'
  }
  return 'screenshot.png'
}

function messageAttachmentUrl(message: RequirementConversationMessage) {
  return message.attachment_url ? apiUrl(message.attachment_url) : ''
}

function messageAttachmentLabel(message: RequirementConversationMessage) {
  return message.attachment_name || '截图附件'
}

function isImageAttachment(message: RequirementConversationMessage) {
  const mimeType = message.attachment_mime ?? ''
  if (mimeType.startsWith('image/')) {
    return true
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(message.attachment_url ?? '')
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }

  const precision = unitIndex === 0 || size >= 10 ? 0 : 1
  return `${size.toFixed(precision)} ${units[unitIndex]}`
}

function isMine(message: RequirementConversationMessage) {
  return Boolean(props.currentUsername && message.sender === props.currentUsername)
}

function avatarText(value?: string | null) {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '?'
}

function parseDate(value?: string | null) {
  if (!value) {
    return null
  }
  const normalizedValue = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(normalizedValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function localDateKey(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateLabel(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return '最近消息'
  }

  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const key = localDateKey(value)

  if (key === localDateKey(today.toISOString())) {
    return '今天'
  }
  if (key === localDateKey(yesterday.toISOString())) {
    return '昨天'
  }

  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === today.getFullYear()
      ? { month: 'long', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric' }
  return date.toLocaleDateString('zh-CN', options)
}

function formatMessageClock(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return ''
  }
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFullDateTime(value?: string | null) {
  const date = parseDate(value)
  if (!date) {
    return '刚刚更新'
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function closeModal() {
  if (sending.value) {
    return
  }
  detailDrawerOpen.value = false
  emit('close')
}

/* ---------------------------------------------------------------- 需求详情抽屉 */

/**
 * 抽屉只读这几个字段。
 *
 * 用户端（api/requirements）与开发者侧（api/devRequirements）各有一份 `RequirementItem`，
 * 字段与必填性略有差异；这里收敛成本地形状，免得把两边类型搅成一个 union 再往下传。
 */
type DrawerRequirement = {
  requirement_id: string
  title: string
  /** 只用来消歧 `deposit_paid` 的文案（一码两义），取值与两侧 `RequirementItem` 一致。 */
  payment_mode: RequirementPaymentMode
  status: string
  budget?: number | null
  created_time?: string
  updated_at: string
  creator?: string
  developer?: string | null
  description?: string | null
  acceptance_criteria?: string | null
}

const detailDrawerOpen = ref(false)
const detailDrawerLoading = ref(false)
const detailDrawerRequirement = ref<DrawerRequirement | null>(null)

function closeDetailDrawer() {
  detailDrawerOpen.value = false
}

// 换了需求就收起抽屉，否则会停在上一笔单据的速览上（内嵌形态里切会话不会重建组件）。
watch(
  () => props.requirementId,
  () => {
    detailDrawerOpen.value = false
  },
)

/**
 * 需求详情抽屉：从右侧划出、覆盖在会话之上，不打断会话上下文。
 *
 * 数据按需自取，做法与 downloadDeliveryArtifact 一致（拉一次「我的需求」列表再按编号取那一条）：
 * 这样四个调用方都不必额外传 prop，也不依赖会话接口多返回字段；开发者侧对应 /dev/requirements/mine。
 */
async function toggleDetailDrawer() {
  if (detailDrawerOpen.value) {
    closeDetailDrawer()
    return
  }

  detailDrawerOpen.value = true

  const requirementId = props.requirementId.trim()
  if (!requirementId || !props.token || detailDrawerLoading.value) {
    return
  }
  // 已经取过同一条就直接用缓存；换了需求则重新取。
  if (detailDrawerRequirement.value?.requirement_id === requirementId) {
    return
  }

  detailDrawerLoading.value = true
  try {
    const rows =
      props.apiMode === 'dev'
        ? await listMyRequirements(props.token)
        : await listRequirements(props.token)
    const found = rows.find((row) => row.requirement_id === requirementId)
    detailDrawerRequirement.value = found
      ? {
        requirement_id: found.requirement_id,
        title: found.title,
        payment_mode: found.payment_mode,
        status: found.status,
        budget: found.budget ?? null,
        created_time: found.created_time,
        updated_at: found.updated_at,
        creator: found.creator,
        // 开发者侧那份 RequirementItem 没有 developer 字段（那侧自己就是开发者），退回当前登录名
        developer:
          'developer' in found
            ? (found.developer ?? null)
            : (props.currentUsername?.trim() || null),
        description: found.description ?? null,
        acceptance_criteria: found.acceptance_criteria ?? null,
      }
      : null
  } catch {
    detailDrawerRequirement.value = null
  } finally {
    detailDrawerLoading.value = false
  }
}

const detailDrawerFields = computed(() => {
  const item = detailDrawerRequirement.value
  if (!item) {
    return []
  }

  return [
    { label: '编号', value: item.requirement_id },
    { label: '发布方式', value: requirementPaymentModeLabel(item.payment_mode) },
    { label: '状态', value: requirementStatusLabel(item.status, item.payment_mode) },
    { label: '预算', value: formatCny(item.budget) },
    { label: '创建', value: item.created_time ? formatCnDateTime(item.created_time) : '时间未知' },
    { label: '更新', value: formatCnDateTime(item.updated_at) },
    { label: '需求方', value: item.creator ?? '—' },
    { label: '开发者', value: item.developer ?? '待接单' },
  ]
})

/* 需求描述与验收标准是富文本，按站内既有口径走 sanitize + v-html（后端还有一道 ammonia），
   不要退化成纯文本——那样段落与列表会被拍平成一行。 */
const detailDrawerDescription = computed(
  () =>
    sanitizeRequirementRichText(detailDrawerRequirement.value?.description ?? '') ||
    '当前需求暂未补充详细描述。',
)

const detailDrawerAcceptance = computed(
  () =>
    sanitizeRequirementRichText(detailDrawerRequirement.value?.acceptance_criteria ?? '') ||
    '当前需求暂未补充验收标准。',
)

function handleBackdropClick() {
  if (!isInline.value) {
    closeModal()
  }
}
</script>

<template>
  <Teleport to="body" :disabled="isInline">
    <div v-if="visible" class="conversation-modal-wrap" :class="{ 'conversation-modal-wrap--inline': isInline }"
      @click.self="handleBackdropClick">
      <section class="conversation-modal" aria-label="需求沟通会话">
        <!-- 内嵌形态在移动端把会话头搬进工作台顶栏（返回 · 标题 · 对方与状态 · 详情 · 刷新），
             省掉顶栏与会话头叠两行；桌面端与弹窗形态原地渲染 -->
        <WorkbenchBarSlot :disabled="!isInline">
        <header class="conversation-modal__header">
          <button class="conversation-modal__icon-btn conversation-modal__back" type="button"
            :aria-label="closeActionLabel" :title="closeActionLabel" @click="closeModal">
            <TIcon>
              <ArrowLeft />
            </TIcon>
          </button>

          <div class="conversation-modal__avatar" aria-hidden="true" @click="toggleDetailDrawer">{{ peerInitial }}</div>

          <!-- 点头像或标题区打开需求详情（移动端顶栏里不放详情按钮，只靠这里进入） -->
          <div class="conversation-modal__identity" role="button" tabindex="0" :aria-expanded="detailDrawerOpen"
            title="查看需求详情" @click="toggleDetailDrawer" @keydown.enter.prevent="toggleDetailDrawer"
            @keydown.space.prevent="toggleDetailDrawer">
            <h3>{{ conversationTitle }}</h3>
            <!-- 副信息一行：对方 · 实时状态 · 最近动静。原来「实时同步中」「最近 9/29 15:30」
                 各占一枚同色胶囊，挨在一起看着像两个并列的标签；现在合成一行浅灰正文，
                 实时状态交给前面的小圆点，头部从三行收到两行。 -->
            <p class="conversation-modal__identity-meta">
              <span class="conversation-modal__peer">{{ conversation ? participantLabel : requirementId }}</span>
              <span class="conversation-modal__live" :class="`conversation-modal__live--${realtimeStatus}`"
                :title="realtimeError">
                {{ realtimeStatusLabel }}
              </span>
              <span class="conversation-modal__recent">{{ lastMessageLabel }}</span>
            </p>
          </div>

          <div class="conversation-modal__header-actions">
            <button class="conversation-modal__icon-btn" type="button" :class="{ 'is-active': detailDrawerOpen }"
              :aria-expanded="detailDrawerOpen" aria-label="需求详情" title="需求详情" @click="toggleDetailDrawer">
              <TIcon>
                <Document />
              </TIcon>
            </button>
            <button class="conversation-modal__icon-btn" type="button" :disabled="loading" aria-label="刷新会话"
              title="刷新会话" @click="loadConversation">
              <TIcon :spin="loading">
                <Refresh />
              </TIcon>
            </button>
          </div>
        </header>
        </WorkbenchBarSlot>

        <div ref="messageListRef" class="conversation-modal__messages">
          <div v-if="hiddenHistorySegments.length" class="conversation-history-notice">
            <strong>此前的沟通记录未公开</strong>
            <p>
              接手前由 {{ hiddenHistoryDevelopers }} 负责的那段沟通默认不展示，需要前任开发者与客户都确认后才会公开。
            </p>
            <ul class="conversation-history-notice__segments">
              <li v-for="segment in hiddenHistorySegments" :key="`${segment.previous_developer}-${segment.segment_start}`">
                <span>前任开发者 {{ segment.previous_developer }}</span>
                <small>{{ segment.segment_start }} ~ {{ segment.segment_end }}</small>
                <em>{{ historySegmentStateLabel(segment.status) }}</em>
              </li>
            </ul>
            <button v-if="canRequestHistory" class="conversation-history-notice__action" type="button"
              :disabled="historyRequesting" @click="requestHistoryDisclosure">
              {{ historyRequesting ? '提交中...' : '申请查看历史沟通' }}
            </button>
            <p v-else class="conversation-history-notice__tip">
              已提交申请，等待前任开发者与客户确认；如有申请被拒绝，那段沟通不会公开。
            </p>
          </div>
          <div v-if="loading" class="conversation-modal__empty">
            <TIcon>
              <ChatDotRound />
            </TIcon>
            <span>会话加载中...</span>
          </div>
          <div v-else-if="errorMessage" class="conversation-modal__empty conversation-modal__empty--error">
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadConversation">重试</button>
          </div>
          <div v-else-if="messages.length === 0" class="conversation-modal__empty">
            <TIcon>
              <ChatDotRound />
            </TIcon>
            <span>{{ hiddenHistorySegments.length ? '此前的沟通记录未公开，暂时没有可查看的消息' : '暂无消息' }}</span>
          </div>
          <template v-else>
            <template v-for="row in timelineItems" :key="row.key">
              <div v-if="row.kind === 'date'" class="conversation-date-pill">{{ row.label }}</div>
              <article v-else-if="row.kind === 'card' && row.card" class="conversation-card"
                :class="`conversation-card--${row.cardSide ?? 'system'}`">
                <div class="conversation-card__head">
                  <TIcon class="conversation-card__icon">
                    <Bell />
                  </TIcon>
                  <strong>{{ row.card.title }}</strong>
                </div>
                <p class="conversation-card__desc">{{ row.card.description }}</p>
                <div class="conversation-card__foot">
                  <time :title="row.createdAt">{{ formatMessageClock(row.createdAt) }}</time>
                  <div class="conversation-card__actions">
                    <!-- 「支付定金 / 支付尾款」不跳需求列表：支付弹窗就在同一条会话底部
                         的工具条上，按下去原地打开它。
                         卡片侧的 `paymentAction` 已按需求当前状态裁定（待缴定金 / 待付尾款）；
                         不再叠加 `actionCaps.canPay`——工具条加载合同签署状态偶发慢半拍时，
                         会把「验收已通过」上该有的「支付尾款」整颗藏掉。弹窗与真正能否付
                         仍归工具条管。 -->
                    <TButton v-if="row.card.paymentAction"
                      class="conversation-card__action" variant="solid" tone="accent" size="sm"
                      @click="runPaymentCardAction()">
                      {{ row.card.actionLabel }}
                    </TButton>
                    <TButton v-else-if="row.card.actionLabel && !row.card.deliveryAction && !row.card.paymentAction"
                      class="conversation-card__action" variant="solid" tone="accent" size="sm"
                      :loading="downloadLoading && row.card.downloadDelivery"
                      @click="runCardAction(row.card, row.message)">
                      {{ row.card.actionLabel }}
                    </TButton>
                    <!-- 「去交付」不跳需求列表：交付弹窗就挂在同一条会话底部的工具条上，
                         按下去原地打开它。能不能交付仍由工具条裁定（没绑资源项目、阶段不对都不给），
                         条件不够时这张卡片就不摆按钮，不给出点了没反应的入口。 -->
                    <TButton v-else-if="row.card.deliveryAction && actionCaps.canDeliver"
                      class="conversation-card__action" variant="solid" tone="accent" size="sm"
                      @click="actionsRef?.openDeliveryDialog()">
                      {{ row.card.actionLabel }}
                    </TButton>
                    <!-- 验收按钮摆在「下载交付产物」之后：这张卡片说的就是「请验收后支付尾款」，
                         顺手就能做。能不能验收仍由工具条裁定（自管模式、合同未签、没有交付版本
                         都不给），弹窗也归它管，避免两处各写一套条件。 -->
                    <TButton v-if="row.card.acceptanceAction && actionCaps.canAcceptDelivery"
                      class="conversation-card__action" variant="solid" tone="accent" size="sm"
                      @click="actionsRef?.openAcceptanceDialog()">
                      验收
                    </TButton>
                  </div>
                </div>
              </article>
              <article v-else-if="row.message" class="conversation-message"
                :class="{ 'conversation-message--mine': row.mine }">
                <div v-if="!row.mine" class="conversation-message__avatar-slot" aria-hidden="true">
                  <div v-if="row.showAvatar" class="conversation-message__avatar">
                    {{ avatarText(row.message.sender) }}
                  </div>
                </div>
                <div class="conversation-message__bubble">
                  <span v-if="isPreviousDeveloperMessage(row.message)" class="conversation-message__history-tag">
                    前任开发者 {{ row.message.sender }}
                  </span>
                  <div v-if="row.message.attachment_url" class="conversation-message__attachment">
                    <a class="conversation-message__attachment-link" :href="messageAttachmentUrl(row.message)"
                      target="_blank" rel="noopener noreferrer" :title="messageAttachmentLabel(row.message)">
                      <img v-if="isImageAttachment(row.message)" :src="messageAttachmentUrl(row.message)"
                        :alt="messageAttachmentLabel(row.message)" />
                      <span v-else class="conversation-message__attachment-file">
                        <TIcon>
                          <Picture />
                        </TIcon>
                      </span>
                    </a>
                    <div class="conversation-message__attachment-meta">
                      <span>{{ messageAttachmentLabel(row.message) }}</span>
                      <small v-if="row.message.attachment_size">{{
                        formatBytes(row.message.attachment_size)
                      }}</small>
                    </div>
                  </div>
                  <p v-if="row.message.content">{{ row.message.content }}</p>
                  <time :title="row.message.created_at">{{
                    formatMessageClock(row.message.created_at)
                  }}</time>
                </div>
              </article>
            </template>
          </template>
        </div>

        <div v-for="item in pendingHistoryVotes" :key="`history-vote-${item.id}`" class="conversation-history-vote">
          <p>
            现任开发者 {{ item.current_developer }} 申请查看前任开发者 {{ item.previous_developer }} 负责期间的沟通记录。
            你和对方都同意后，这段记录才会向现任开发者公开；任何一方拒绝则维持隐藏。
          </p>
          <div class="conversation-history-vote__actions">
            <button type="button" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'approved')">
              同意公开
            </button>
            <button type="button" :disabled="historyVotingId !== null"
              @click="respondHistoryDisclosure(item, 'rejected')">
              拒绝
            </button>
          </div>
        </div>

        <!-- 业务入口（查看合同、解除合作、付款、交付……）放在输入底栏之外、紧贴其上方；
             表情与附件是写消息的工具，跟输入框、发送键排在同一行 -->
        <div v-if="viewerRole" class="conversation-modal__tools">
          <RequirementConversationActions ref="actionsRef" :token="token"
            :requirement-id="requirementId" :role="viewerRole" @changed="loadConversation"
            @capabilities="onActionCapabilities" />
        </div>

        <footer class="conversation-modal__composer">
          <!-- 需求取消、或交付资源已转为需求方资源后会话都会关闭，文案只讲共同点：仅供查看、不能再发言。 -->
          <p v-if="conversationClosed" class="conversation-modal__closed-tip">
            会话已关闭：这笔需求已结束，历史消息仅供查看，双方都不能再发言。
          </p>
          <div class="conversation-modal__composer-main">

            <Transition name="conversation-emoji">
              <div v-if="emojiPanelOpen" class="conversation-modal__emoji-panel">
                <button v-for="emoji in emojiOptions" :key="emoji" class="conversation-modal__emoji-btn" type="button"
                  :aria-label="`插入表情 ${emoji}`" @click="insertEmoji(emoji)">
                  {{ emoji }}
                </button>
              </div>
            </Transition>

            <div v-if="attachmentDraft" class="conversation-modal__attachment-preview">
              <img :src="attachmentDraft.previewUrl" alt="截图预览" />
              <div>
                <strong>{{ attachmentDraft.name }}</strong>
                <span>{{ attachmentDraft.sizeLabel }}</span>
              </div>
              <button class="conversation-modal__attachment-remove" type="button" aria-label="移除附件" title="移除附件"
                @click="clearAttachmentDraft">
                <TIcon>
                  <Close />
                </TIcon>
              </button>
            </div>

            <p v-if="attachmentError" class="conversation-modal__attachment-error">
              {{ attachmentError }}
            </p>

            <!-- R014：合同有效期届满进入锁定 / 已清除后，会话只读；历史消息与附件仍可查看与下载。 -->
            <p v-if="requirementArchived" class="conversation-modal__readonly-hint" role="status"
              data-testid="conversation-archive-readonly">
              合同有效期已届满，会话在资料保留期内只读：不能发消息或传附件，历史内容仍可查看与下载。
            </p>
            <div class="conversation-modal__input-row">
              <button class="conversation-modal__tool-btn" :class="{ 'is-active': emojiPanelOpen }" type="button"
                :disabled="sending || loading || composerLocked" aria-label="选择表情" title="选择表情"
                @click="toggleEmojiPanel">
                <TIcon>
                  <MagicStick />
                </TIcon>
              </button>
              <button class="conversation-modal__tool-btn" type="button"
                :disabled="sending || loading || composerLocked" aria-label="添加截图附件" title="添加截图附件"
                @click="openAttachmentPicker">
                <TIcon>
                  <Paperclip />
                </TIcon>
              </button>
              <input ref="attachmentInputRef" class="conversation-modal__attachment-native" type="file"
                accept="image/png,image/jpeg,image/webp,image/gif" @change="handleAttachmentFileChange" />
              <div class="conversation-modal__input-shell">
                <textarea ref="draftInputRef" v-model="draft" maxlength="5000" placeholder="输入消息" spellcheck="false"
                  autocomplete="new-password" autocorrect="off" autocapitalize="off" aria-autocomplete="none"
                  data-ms-editor="false" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"
                  data-lt-active="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true"
                  :disabled="composerLocked" @keydown="handleComposerKeydown" @paste="handleComposerPaste"></textarea>
              </div>
              <button class="conversation-modal__send-btn" type="button" :disabled="!canSend" aria-label="发送消息"
                title="发送消息" @click="submitMessage">
                <TIcon>
                  <Position />
                </TIcon>
              </button>
            </div>
          </div>
        </footer>

        <!-- 需求详情抽屉：从右侧划出、盖在会话之上，不跳页也不打断会话上下文；
             数据按需自取（见 toggleDetailDrawer）。

             Teleport 到 body：内嵌形态（消息中心）下消息页自己在一个层叠上下文里，
             留在原地的话抽屉的 z-index 再高也压不过站点的吸顶导航（40）与底部坞（60），
             移动端会出现「抽屉顶栏和底栏被盖住」。与验收弹窗同一处理（见 AcceptanceDialog）。 -->
        <Teleport to="body">
          <Transition name="conversation-drawer">
            <div v-if="detailDrawerOpen" class="conversation-drawer-layer">
              <div class="conversation-drawer__backdrop" @click="closeDetailDrawer"></div>
              <aside class="conversation-drawer" aria-label="需求详情">
                <header class="conversation-drawer__head">
                  <h4>需求详情</h4>
                  <button class="conversation-modal__icon-btn" type="button" aria-label="收起需求详情" title="收起需求详情"
                    @click="closeDetailDrawer">
                    <TIcon>
                      <Close />
                    </TIcon>
                  </button>
                </header>

                <div class="conversation-drawer__body">
                  <p v-if="detailDrawerLoading" class="conversation-drawer__hint" role="status">需求详情加载中…</p>
                  <p v-else-if="!detailDrawerRequirement" class="conversation-drawer__hint">未能加载这条需求的详情。</p>
                  <template v-else>
                    <h5 class="conversation-drawer__title">{{ detailDrawerRequirement.title }}</h5>

                    <dl class="conversation-drawer__meta">
                      <div v-for="field in detailDrawerFields" :key="field.label">
                        <dt>{{ field.label }}</dt>
                        <dd :title="field.value">{{ field.value }}</dd>
                      </div>
                    </dl>

                    <section class="conversation-drawer__block">
                      <h6>需求描述</h6>
                      <article class="conversation-drawer__rich" v-html="detailDrawerDescription"></article>
                    </section>

                    <section class="conversation-drawer__block">
                      <h6>验收标准</h6>
                      <article class="conversation-drawer__rich" v-html="detailDrawerAcceptance"></article>
                    </section>
                  </template>
                </div>
              </aside>
            </div>
          </Transition>
        </Teleport>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.conversation-modal-wrap {
  position: fixed;
  inset: 0;
  z-index: 130;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  background: rgba(15, 23, 42, 0.42);
}

.conversation-modal-wrap--inline {
  position: static;
  inset: auto;
  z-index: auto;
  display: block;
  padding: 0;
  background: transparent;
}

.conversation-modal {
  width: min(720px, 100%);
  max-height: min(760px, calc(100dvh - 36px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(226, 232, 240, 0.95);
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
}

.conversation-modal-wrap--inline .conversation-modal {
  width: 100%;
  height: min(860px, calc(100dvh - 109px));
  min-height: min(440px, calc(100dvh - 109px));
  max-height: calc(100dvh - 109px);
  border-radius: 16px;
  box-shadow: 0 8px 20px rgba(76, 103, 172, 0.06);
}

.conversation-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.9);
}

.conversation-modal-wrap--inline .conversation-modal__header {
  align-items: center;
  padding: 14px 16px 12px;
}

.conversation-modal__header h3 {
  margin: 0;
  color: #0f172a;
  /* 标题字号只此一处：原来基础是 20px、内嵌形态覆写成 18px、身份块又覆写成 16px，
     同一颗标题在两种形态下三种大小，后两条还互相盖。两种形态一律 18px，
     触屏档再小一档（见 .conversation-modal__identity h3 的媒体查询）。 */
  font-size: 18px;
}

/* 副信息的颜色；间距、字号与截断在 .conversation-modal__identity 那两处（两种形态一致） */
.conversation-modal__header p {
  color: #64748b;
}

/* 副信息一行：对方 · 实时状态 · 最近动静。段间用一个间隔点分开，不给每段套胶囊——
   三枚同色胶囊并排会读成「三个标签」，其中时间本来就不是标签。 */
.conversation-modal__identity-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 6px;
  font-size: 12px;
}

/* 段间不留「· ●」两个点挨着：实时状态前面那颗彩色圆点本身就是分隔，
   所以只在它后面补一个间隔点，把「最近 …」与前面分开。 */
.conversation-modal__identity-meta > .conversation-modal__live::after {
  content: '·';
  margin-left: 6px;
  color: #cbd5e1;
}

/* 一方名过长时自己省略，不要顶破标题栏 */
.conversation-modal__peer {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.conversation-modal__live::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #94a3b8;
  flex: 0 0 auto;
}

.conversation-modal__live--connected::before {
  background: #16a34a;
}

.conversation-modal__live--connecting::before {
  background: #2563eb;
}

.conversation-modal__live--error::before {
  background: #d97706;
}

.conversation-modal__header-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}

.conversation-modal__close,
.conversation-modal__composer button {
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  cursor: pointer;
}

.conversation-modal__close {
  flex: 0 0 auto;
  padding: 7px 12px;
}

.conversation-modal__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 20px;
  background: #f8fafc;
}

.conversation-modal-wrap--inline .conversation-modal__messages {
  min-height: 0;
  padding: 14px 16px;
}

.conversation-modal__empty {
  display: grid;
  place-items: center;
  min-height: 180px;
  color: #64748b;
}

.conversation-modal__empty--error {
  color: #b42318;
  gap: 12px;
}

.conversation-modal__empty--error button {
  border: 1px solid rgba(180, 35, 24, 0.24);
  border-radius: 10px;
  background: #fff7f5;
  color: #b42318;
  padding: 7px 12px;
  cursor: pointer;
}

.conversation-message {
  width: min(78%, 520px);
  margin-bottom: 14px;
}

.conversation-message--mine {
  margin-left: auto;
}

.conversation-message__meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 12px;
}

.conversation-message p {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 14px 14px 14px 4px;
  background: #ffffff;
  color: #0f172a;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine p {
  border-color: rgba(46, 116, 255, 0.18);
  border-radius: 14px 14px 4px 14px;
  background: #eaf2ff;
}

.conversation-modal__composer {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
  background: #ffffff;
}

.conversation-modal__closed-tip {
  grid-column: 1 / -1;
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.conversation-modal-wrap--inline .conversation-modal__composer {
  padding: 12px 14px;
}

.conversation-modal__send-box {
  align-self: end;
  display: grid;
  gap: 8px;
  justify-items: end;
}

.conversation-modal__send-box span {
  color: #64748b;
  font-size: 12px;
}

.conversation-modal__composer textarea {
  min-height: 72px;
  resize: vertical;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 12px;
  padding: 10px 12px;
  color: #0f172a;
  font: inherit;
  line-height: 1.6;
}

.conversation-modal-wrap--inline .conversation-modal__composer textarea {
  min-height: 60px;
}

.conversation-modal__composer button {
  align-self: end;
  min-width: 84px;
  height: 40px;
  padding: 0 16px;
  background: #1f6feb;
  color: #ffffff;
  border-color: #1f6feb;
}

.conversation-modal__composer button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .conversation-modal-wrap {
    padding: 10px;
  }

  .conversation-modal-wrap--inline {
    padding: 0;
  }

  .conversation-modal {
    max-height: calc(100dvh - 20px);
    border-radius: 14px;
  }

  .conversation-modal-wrap--inline .conversation-modal {
    height: calc(100dvh - 118px);
    min-height: min(440px, calc(100dvh - 118px));
    max-height: calc(100dvh - 118px);
  }

  .conversation-message {
    width: 100%;
  }

  .conversation-modal__composer {
    grid-template-columns: 1fr;
  }

  .conversation-modal__header {
    flex-direction: column;
  }

  .conversation-modal__header-actions {
    width: 100%;
  }

  .conversation-modal__header-actions button {
    flex: 1;
  }

  .conversation-modal__send-box {
    width: 100%;
    justify-items: stretch;
  }

  .conversation-modal__composer button {
    width: 100%;
  }
}

.conversation-modal {
  width: min(760px, 100%);
  border-color: rgba(213, 226, 244, 0.98);
  background: #f7fbff;
}

.conversation-modal-wrap--inline .conversation-modal {
  height: min(860px, calc(100dvh - 109px));
  min-height: min(440px, calc(100dvh - 109px));
  max-height: calc(100dvh - 109px);
  box-shadow: 0 10px 28px rgba(76, 103, 172, 0.08);
}

.conversation-modal__header {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-bottom-color: rgba(213, 226, 244, 0.92);
  background: rgba(255, 255, 255, 0.94);
}

.conversation-modal-wrap--inline .conversation-modal__header {
  display: grid;
  align-items: center;
  padding: 10px 12px;
}

.conversation-modal__identity {
  min-width: 0;
}

.conversation-modal__identity h3 {
  margin: 0;
  overflow: hidden;
  color: #0f172a;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 副信息一行：排列与配色见 .conversation-modal__identity-meta。
   与标题的间距只此一处——原来基础层 6px、内嵌形态 4px、身份块 2px 三处互相盖，
   后一条写在前两条之上，改哪一处都不生效。*/
.conversation-modal__identity p {
  margin: 4px 0 0;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__avatar,
.conversation-message__avatar {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
  background: linear-gradient(135deg, #4f8cff, #5ec8a8);
  color: #ffffff;
  font-weight: 900;
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.16);
}

.conversation-modal__avatar {
  width: 42px;
  height: 42px;
  font-size: 17px;
}

.conversation-message__avatar {
  width: 30px;
  height: 30px;
  margin-bottom: 2px;
  font-size: 12px;
}

/* 「实时同步中 · 最近 …」那一行的胶囊底已去掉：副信息走身份块的字号与灰色（见
   .conversation-modal__identity-meta），不要在这里再补一层底色。 */

.conversation-modal__icon-btn,
.conversation-modal__send-btn {
  display: inline-grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  transition:
    background 140ms ease,
    box-shadow 140ms ease,
    color 140ms ease,
    transform 140ms ease;
}

.conversation-modal__icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  background: transparent;
  color: #475569;
  font-size: 18px;
}

.conversation-modal__icon-btn:hover:not(:disabled) {
  background: #eef6ff;
  color: #1d4ed8;
}

.conversation-modal__icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.conversation-modal__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px 18px 20px;
  background: linear-gradient(135deg,
      rgba(225, 241, 255, 0.78),
      rgba(248, 252, 255, 0.9) 44%,
      rgba(235, 250, 244, 0.78));
  scrollbar-color: rgba(79, 140, 255, 0.58) transparent;
  scrollbar-width: thin;
}

.conversation-modal-wrap--inline .conversation-modal__messages {
  padding: 18px 18px 20px;
}

.conversation-modal__messages::-webkit-scrollbar {
  width: 8px;
}

.conversation-modal__messages::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__messages::-webkit-scrollbar-track {
  background: transparent;
}

.conversation-modal__messages::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(79, 140, 255, 0.5);
}

.conversation-modal__empty {
  align-content: center;
  gap: 10px;
  min-height: 220px;
  text-align: center;
}

.conversation-modal__empty .t73-icon {
  color: var(--73-accent);
  font-size: 30px;
}

.conversation-date-pill {
  width: max-content;
  max-width: 100%;
  margin: 4px auto 14px;
  padding: 4px 10px;
  border: 1px solid rgba(203, 213, 225, 0.74);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.78);
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  box-shadow: 0 8px 18px rgba(76, 103, 172, 0.06);
}

.conversation-message {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  margin: 0 0 10px;
}

.conversation-message--mine {
  justify-content: flex-end;
}

.conversation-message__bubble {
  position: relative;
  max-width: min(70%, 620px);
  min-width: 58px;
  padding: 8px 10px 6px;
  border: 1px solid rgba(221, 231, 246, 0.92);
  border-radius: 16px 16px 16px 5px;
  background: rgba(255, 255, 255, 0.96);
  color: #0f172a;
  box-shadow: 0 8px 18px rgba(76, 103, 172, 0.08);
}

.conversation-message--mine .conversation-message__bubble {
  border-color: rgba(96, 165, 250, 0.28);
  border-radius: 16px 16px 5px 16px;
  background: #ddecff;
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.08);
}

.conversation-message__sender {
  margin-bottom: 4px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.35;
}

.conversation-message__bubble p {
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}

.conversation-message--mine .conversation-message__bubble p {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.conversation-message__bubble time {
  display: block;
  margin-top: 2px;
  color: #64748b;
  font-size: 10px;
  line-height: 1.2;
  text-align: right;
}

.conversation-modal__composer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 10px 12px 12px;
  border-top-color: rgba(213, 226, 244, 0.92);
  background: rgba(255, 255, 255, 0.96);
}

.conversation-modal__input-shell {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 8px 10px 8px 12px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 18px;
  background: #ffffff;
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.03);
}

.conversation-modal__input-shell textarea {
  width: 100%;
  min-height: 38px;
  max-height: 120px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 6px 0;
  color: #0f172a;
  background: transparent;
  font: inherit;
  line-height: 1.55;
}

.conversation-modal__input-shell span {
  color: #94a3b8;
  font-size: 11px;
  white-space: nowrap;
}

.conversation-modal__send-btn {
  width: 46px;
  height: 46px;
  min-width: 0;
  padding: 0;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font-size: 20px;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.22);
}

.conversation-modal__send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #1d4ed8;
  box-shadow: 0 12px 26px rgba(37, 99, 235, 0.26);
}

.conversation-modal__send-btn:disabled {
  cursor: not-allowed;
  background: #cbd5e1;
  box-shadow: none;
  opacity: 0.8;
}

@media (max-width: 640px) {
  .conversation-modal-wrap--inline .conversation-modal {
    height: calc(100dvh - 118px);
    min-height: min(440px, calc(100dvh - 118px));
    max-height: calc(100dvh - 118px);
  }

  .conversation-modal__header {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    padding: 8px 10px;
  }

  .conversation-modal__avatar {
    width: 38px;
    height: 38px;
  }

  .conversation-modal__identity h3 {
    font-size: 15px;
  }

  /* 触屏档：时间隐掉，副信息只留「对方 · 实时状态」；上一段末尾的间隔点也要一起收，
     否则行尾吊着一个点 */
  .conversation-modal__recent {
    display: none;
  }

  .conversation-modal__identity-meta > .conversation-modal__live::after {
    content: none;
  }

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 14px 10px 16px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }

  .conversation-modal__composer {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    padding: 9px 10px 10px;
  }

  .conversation-modal__input-shell {
    grid-template-columns: minmax(0, 1fr);
    gap: 4px;
    border-radius: 16px;
  }

  .conversation-modal__input-shell span {
    justify-self: end;
  }

  .conversation-modal__send-btn {
    width: 44px;
    height: 44px;
  }
}

.conversation-modal__header {
  min-height: 68px;
}

.conversation-modal__messages {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.conversation-date-pill,
.conversation-message {
  max-width: 880px;
}

.conversation-message {
  margin-right: auto;
  margin-left: auto;
}

.conversation-message__bubble {
  max-width: min(68%, 560px);
}

.conversation-message--mine .conversation-message__bubble {
  background: #dcecff;
}

.conversation-modal__composer {
  margin-top: 0;
  align-items: center;
}

.conversation-modal__input-shell {
  min-height: 52px;
}

.conversation-modal-wrap--inline .conversation-modal__input-shell textarea {
  min-height: 38px;
}

/* R047 断点收敛：原 820px → 640px（用户决定统一到 640） */
@media (max-width: 640px) {
  .conversation-message__bubble {
    max-width: min(76%, 560px);
  }

  .conversation-modal__header {
    min-height: 62px;
  }

  .conversation-message {
    max-width: 100%;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }
}

.conversation-modal__messages {
  background-color: #d8efcf;
  background-image:
    radial-gradient(circle at 16px 18px, rgba(73, 132, 85, 0.12) 0 1px, transparent 2px),
    radial-gradient(circle at 78px 42px, rgba(73, 132, 85, 0.1) 0 1px, transparent 2px),
    linear-gradient(135deg, rgba(201, 229, 195, 0.9), rgba(224, 242, 216, 0.88));
  background-size:
    92px 72px,
    120px 96px,
    auto;
  padding: 12px 14px 16px;
}

.conversation-date-pill {
  margin-bottom: 10px;
  padding: 3px 10px;
  border: 0;
  background: rgba(255, 255, 255, 0.72);
  color: #5d765c;
  box-shadow: 0 4px 10px rgba(87, 125, 93, 0.12);
}

.conversation-message {
  max-width: 100%;
  min-height: 0;
  align-items: flex-end;
  gap: 6px;
  margin: 0 0 4px;
}

.conversation-message__avatar-slot {
  width: 28px;
  display: inline-flex;
  flex: 0 0 28px;
  justify-content: center;
}

.conversation-message__avatar {
  width: 24px;
  height: 24px;
  margin-bottom: 1px;
  background: linear-gradient(135deg, #f1a33c, #f9c25c);
  font-size: 11px;
  box-shadow: 0 4px 10px rgba(136, 88, 27, 0.16);
}

.conversation-message__bubble {
  display: grid;
  grid-template-columns: minmax(0, auto) auto;
  align-items: end;
  column-gap: 10px;
  row-gap: 2px;
  width: fit-content;
  max-width: min(68%, 620px);
  min-width: 0;
  padding: 5px 8px 4px;
  border: 0;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 1px 1px rgba(54, 86, 58, 0.16);
}

.conversation-message--mine .conversation-message__bubble {
  background: #d9fdd3;
  box-shadow: 0 1px 1px rgba(54, 86, 58, 0.14);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  grid-column: 1;
  min-width: 0;
  color: #111827;
  font-size: 13px;
  line-height: 1.38;
}

.conversation-message__bubble time {
  grid-column: 2;
  margin: 0;
  color: #688168;
  font-size: 10px;
  line-height: 1.15;
  white-space: nowrap;
}

.conversation-message__sender {
  display: none;
}

/* R047 断点收敛：原 820px → 640px（用户决定统一到 640） */
@media (max-width: 640px) {
  .conversation-message__bubble {
    max-width: min(78%, 620px);
  }

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 10px 8px 14px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 40px);
  }
}

.conversation-modal__composer {
  grid-template-columns: minmax(0, 1fr) 48px;
  align-items: end;
  gap: 10px;
  padding: 8px 12px;
  border-top: 1px solid rgba(167, 190, 166, 0.36);
  background: #f7f8f4;
}

.conversation-modal__composer-main {
  position: relative;
  min-width: 0;
  display: grid;
  gap: 6px;
}

.conversation-modal__tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 2px;
}

.conversation-modal__composer .conversation-modal__tool-btn,
.conversation-modal__composer .conversation-modal__emoji-btn,
.conversation-modal__composer .conversation-modal__attachment-remove {
  display: inline-grid;
  place-items: center;
  min-width: 0;
  padding: 0;
  border: 1px solid rgba(185, 204, 190, 0.72);
  background: rgba(255, 255, 255, 0.92);
  color: #3f5f49;
  box-shadow: none;
}

.conversation-modal__composer .conversation-modal__tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  font-size: 17px;
}

.conversation-modal__composer .conversation-modal__tool-btn:hover:not(:disabled),
.conversation-modal__composer .conversation-modal__tool-btn.is-active {
  border-color: rgba(45, 118, 236, 0.34);
  background: #eef6ff;
  color: #1d4ed8;
  transform: translateY(-1px);
}

.conversation-modal__composer .conversation-modal__tool-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.conversation-modal__attachment-native {
  display: none;
}

.conversation-modal__emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 32px);
  gap: 6px;
  width: max-content;
  max-width: 100%;
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(54, 86, 58, 0.12);
}

.conversation-modal__composer .conversation-modal__emoji-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 18px;
  line-height: 1;
}

.conversation-modal__composer .conversation-modal__emoji-btn:hover {
  border-color: rgba(45, 118, 236, 0.26);
  background: #f1f7ff;
  transform: translateY(-1px);
}

.conversation-emoji-enter-active,
.conversation-emoji-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
}

.conversation-emoji-enter-from,
.conversation-emoji-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.conversation-modal__attachment-preview {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  width: min(420px, 100%);
  padding: 8px;
  border: 1px solid rgba(185, 204, 190, 0.72);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 6px 16px rgba(54, 86, 58, 0.08);
}

.conversation-modal__attachment-preview img {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  object-fit: cover;
  background: #eef3eb;
}

.conversation-modal__attachment-preview div {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.conversation-modal__attachment-preview strong,
.conversation-modal__attachment-preview span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-modal__attachment-preview strong {
  color: #172033;
  font-size: 13px;
  line-height: 1.25;
}

.conversation-modal__attachment-preview span {
  color: #6b7f6d;
  font-size: 12px;
}

.conversation-modal__composer .conversation-modal__attachment-remove {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: #64748b;
}

.conversation-modal__composer .conversation-modal__attachment-remove:hover {
  border-color: rgba(190, 18, 60, 0.2);
  background: #fff1f2;
  color: #be123c;
}

.conversation-modal__attachment-error {
  margin: 0;
  padding-left: 4px;
  color: #b42318;
  font-size: 12px;
  line-height: 1.35;
}

.conversation-message__attachment {
  grid-column: 1 / -1;
  display: grid;
  gap: 5px;
  width: min(260px, 64vw);
  max-width: 100%;
}

.conversation-message__attachment-link {
  display: block;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
  color: inherit;
}

.conversation-message__attachment-link img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  background: rgba(15, 23, 42, 0.04);
}

.conversation-message__attachment-file {
  display: grid;
  place-items: center;
  height: 120px;
  color: #2d76ec;
  font-size: 28px;
}

.conversation-message__attachment-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  color: #536b55;
  font-size: 11px;
  line-height: 1.25;
}

.conversation-message__attachment-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-message__attachment-meta small {
  flex: 0 0 auto;
  color: #78907a;
  font-size: 10px;
}

.conversation-message__attachment+p {
  grid-column: 1 / -1;
  margin-top: 2px;
}

.conversation-modal__composer .conversation-modal__input-shell {
  position: relative;
  display: flex;
  min-height: 48px;
  height: 48px;
  align-items: center;
  padding: 0 12px 0 18px;
  border-color: rgba(148, 163, 184, 0.5);
  border-radius: 999px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.conversation-modal__composer .conversation-modal__input-shell:focus-within {
  border-color: rgba(47, 125, 246, 0.62);
  box-shadow:
    0 0 0 3px rgba(47, 125, 246, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
}

.conversation-modal__composer .conversation-modal__input-shell textarea {
  appearance: none;
  -webkit-appearance: none;
  height: 24px;
  min-height: 24px;
  max-height: 72px;
  padding: 0;
  resize: none;
  color: #111827;
  font-size: 15px;
  line-height: 24px;
  overflow: hidden;
  scrollbar-width: none;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-scrollbar-button,
.conversation-modal__composer .conversation-modal__input-shell textarea::-webkit-resizer {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__composer .conversation-modal__input-shell input {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  min-width: 0;
  height: 24px;
  border: 0;
  outline: 0;
  padding: 0 82px 0 0;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 15px;
  line-height: 24px;
}

.conversation-modal__composer .conversation-modal__input-shell input::placeholder {
  color: #8a95a5;
}

.conversation-modal__composer .conversation-modal__input-shell textarea::placeholder {
  color: #8a95a5;
}

.conversation-modal__composer .conversation-modal__input-shell span {
  position: absolute;
  top: 50%;
  right: 16px;
  z-index: 2;
  transform: translateY(-50%);
  padding-left: 8px;
  background: #ffffff;
  color: #8fa0b4;
  font-size: 12px;
  line-height: 1;
  pointer-events: none;
}

.conversation-modal__composer .conversation-modal__send-btn {
  align-self: center;
  width: 48px;
  min-width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: #2d76ec;
  color: #ffffff;
  font-size: 22px;
  box-shadow: 0 8px 18px rgba(45, 118, 236, 0.24);
}

.conversation-modal__composer .conversation-modal__send-btn:hover:not(:disabled) {
  background: #2567d8;
  box-shadow: 0 10px 22px rgba(45, 118, 236, 0.28);
}

.conversation-modal__composer .conversation-modal__send-btn:disabled {
  background: #d5dce6;
  color: #ffffff;
  box-shadow: none;
}

@media (max-width: 640px) {
  .conversation-modal__composer {
    grid-template-columns: minmax(0, 1fr) 44px;
    padding: 8px 10px;
  }

  .conversation-modal__tools {
    gap: 5px;
  }

  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 32px;
    height: 32px;
  }

  .conversation-modal__emoji-panel {
    grid-template-columns: repeat(6, 32px);
  }

  .conversation-modal__attachment-preview {
    width: 100%;
  }

  .conversation-modal__composer .conversation-modal__input-shell {
    min-height: 44px;
    height: 44px;
    padding-right: 10px;
    padding-left: 14px;
  }

  .conversation-modal__composer .conversation-modal__input-shell textarea {
    height: 22px;
    min-height: 22px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell input {
    height: 22px;
    padding-right: 70px;
    font-size: 14px;
    line-height: 22px;
  }

  .conversation-modal__composer .conversation-modal__input-shell span {
    font-size: 11px;
  }

  .conversation-modal__composer .conversation-modal__send-btn {
    width: 44px;
    min-width: 44px;
    height: 44px;
  }
}

.conversation-modal {
  border-color: rgba(216, 228, 244, 0.98);
  background: #f8fbff;
}

.conversation-modal-wrap--inline .conversation-modal {
  box-shadow: 0 16px 38px rgba(71, 102, 148, 0.1);
}

.conversation-modal__header {
  border-bottom-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.96);
}

.conversation-modal__avatar,
.conversation-message__avatar {
  background: linear-gradient(135deg, #4f8cff, #5ec8a8);
  box-shadow: 0 8px 18px rgba(79, 140, 255, 0.18);
}

/* 副信息的配色见 .conversation-modal__identity-meta：一行灰字 + 彩色小圆点，不再铺胶囊底 */

.conversation-modal__messages {
  background-color: #f3f7fc;
  background-image:
    radial-gradient(circle at 18px 18px, rgba(79, 140, 255, 0.08) 0 1px, transparent 2px),
    radial-gradient(circle at 88px 52px, rgba(94, 200, 168, 0.07) 0 1px, transparent 2px),
    linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(237, 245, 252, 0.96));
  background-size:
    96px 76px,
    128px 104px,
    auto;
  padding: 16px 18px 18px;
  scrollbar-color: rgba(79, 140, 255, 0.42) transparent;
}

.conversation-date-pill {
  margin: 2px auto 12px;
  padding: 4px 11px;
  border: 1px solid rgba(209, 222, 239, 0.86);
  background: rgba(255, 255, 255, 0.9);
  color: #64748b;
  box-shadow: 0 8px 18px rgba(71, 102, 148, 0.08);
}

.conversation-message {
  gap: 8px;
  margin-bottom: 8px;
}

.conversation-message__avatar-slot {
  width: 30px;
  flex-basis: 30px;
}

.conversation-message__avatar {
  width: 26px;
  height: 26px;
  font-size: 11px;
}

.conversation-message__bubble {
  max-width: min(72%, 620px);
  padding: 8px 10px 6px;
  border: 1px solid rgba(218, 229, 244, 0.92);
  border-radius: 15px 15px 15px 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 8px 20px rgba(71, 102, 148, 0.08);
}

.conversation-message--mine .conversation-message__bubble {
  border-color: rgba(172, 202, 255, 0.84);
  border-radius: 15px 15px 6px 15px;
  background: #e8f1ff;
  box-shadow: 0 8px 20px rgba(45, 118, 236, 0.1);
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  color: #182335;
  font-size: 14px;
  line-height: 1.48;
}

.conversation-message__bubble time {
  color: #7d8da3;
}

.conversation-modal__composer {
  align-items: end;
  border-top-color: rgba(216, 228, 244, 0.95);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 -10px 24px rgba(71, 102, 148, 0.06);
}

.conversation-modal__composer-main {
  gap: 8px;
}

.conversation-modal__tools {
  gap: 7px;
  padding-left: 4px;
}

.conversation-modal__composer .conversation-modal__tool-btn,
.conversation-modal__composer .conversation-modal__emoji-btn,
.conversation-modal__composer .conversation-modal__attachment-remove {
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  color: #52657f;
}

.conversation-modal__composer .conversation-modal__tool-btn {
  width: 36px;
  height: 36px;
  box-shadow: 0 8px 18px rgba(71, 102, 148, 0.08);
}

.conversation-modal__composer .conversation-modal__tool-btn:hover:not(:disabled),
.conversation-modal__composer .conversation-modal__tool-btn.is-active {
  border-color: rgba(79, 140, 255, 0.44);
  background: #eef6ff;
  color: #2563eb;
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.14);
}

.conversation-modal__emoji-panel {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 0;
  z-index: 4;
  border-color: rgba(207, 220, 238, 0.96);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 38px rgba(71, 102, 148, 0.18);
}

.conversation-modal__composer .conversation-modal__emoji-btn:hover {
  border-color: rgba(79, 140, 255, 0.34);
  background: #eef6ff;
}

.conversation-modal__attachment-preview {
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(71, 102, 148, 0.1);
}

.conversation-modal__attachment-preview img {
  background: #f1f6fb;
}

.conversation-modal__attachment-preview span,
.conversation-message__attachment-meta,
.conversation-message__attachment-meta small {
  color: #64748b;
}

.conversation-message__attachment-link {
  border: 1px solid rgba(216, 228, 244, 0.88);
  background: #f8fbff;
}

.conversation-message__attachment-link img {
  background: #f8fbff;
}

.conversation-modal__composer .conversation-modal__input-shell {
  min-height: 50px;
  height: 50px;
  border-color: rgba(207, 220, 238, 0.96);
  background: #ffffff;
  box-shadow:
    0 8px 22px rgba(71, 102, 148, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.96);
}

.conversation-modal__composer .conversation-modal__input-shell:focus-within {
  border-color: rgba(79, 140, 255, 0.7);
  box-shadow:
    0 0 0 3px rgba(79, 140, 255, 0.13),
    0 10px 24px rgba(71, 102, 148, 0.1);
}

.conversation-modal__composer .conversation-modal__input-shell textarea {
  color: #182335;
}

.conversation-modal__composer .conversation-modal__input-shell span {
  color: #9aa8ba;
}

.conversation-modal__composer .conversation-modal__send-btn {
  background: #2d76ec;
  box-shadow: 0 12px 24px rgba(45, 118, 236, 0.24);
}

.conversation-modal__composer .conversation-modal__send-btn:hover:not(:disabled) {
  background: #2467d8;
  box-shadow: 0 14px 28px rgba(45, 118, 236, 0.28);
}

/* R047 断点收敛：原 820px → 640px（用户决定统一到 640） */
@media (max-width: 640px) {
  .conversation-message__bubble {
    max-width: min(78%, 620px);
  }

  .conversation-modal__messages,
  .conversation-modal-wrap--inline .conversation-modal__messages {
    padding: 12px 10px 14px;
  }

  .conversation-message__bubble {
    max-width: calc(100% - 42px);
  }

  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 34px;
    height: 34px;
  }

  .conversation-modal__emoji-panel {
    left: 0;
    max-width: calc(100vw - 36px);
  }
}

.conversation-message {
  flex: 0 0 auto;
  margin-bottom: 10px;
}

.conversation-date-pill {
  flex: 0 0 auto;
}

.conversation-message:last-child {
  margin-bottom: 0;
}

.conversation-message__bubble {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 104px;
  padding: 10px 12px 7px;
}

.conversation-message__bubble p,
.conversation-message--mine .conversation-message__bubble p {
  width: 100%;
  font-size: 15px;
  line-height: 1.5;
}

.conversation-message__bubble time {
  align-self: flex-end;
  margin-top: 0;
  font-size: 11px;
  line-height: 1;
}

.conversation-message__attachment {
  width: min(280px, 64vw);
}

/* 状态变化卡片：靠哪一侧看这一步是谁做的（会话里的气泡也是这套左右口径）——
   我方发起靠右、对方发起靠左、纯平台通知（结单、客服裁决、超时兜底）居中。
   居中那一类见下面的 `--system`：它不摆卡片外框，只留一行居中的系统说明。
   卡片宽度小于消息列，auto 外边距才能在剩余空间里把它推到对应一侧。 */
.conversation-card {
  display: grid;
  gap: 6px;
  width: min(420px, 92%);
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid rgba(37, 99, 235, 0.22);
  border-radius: 12px;
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.98));
}

.conversation-card--other {
  margin-right: auto;
}

.conversation-card--mine {
  margin-left: auto;
}

/* 平台通知（居中那一类）不摆卡片：去掉边框、底色与圆角，只留居中说明，读起来是
   「系统在播报进度」，而不是某一方发来的一张卡片。带按钮的通知（如「去需求大厅」）
   按钮跟着文字一起居中，不因为去掉外框丢掉出口。 */
.conversation-card--system {
  width: min(520px, 100%);
  margin-right: auto;
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: none;
  justify-items: center;
  text-align: center;
}

.conversation-card--system .conversation-card__head {
  justify-content: center;
  color: #64748b;
}

.conversation-card--system .conversation-card__desc {
  color: #94a3b8;
}

.conversation-card--system .conversation-card__foot {
  justify-content: center;
}

.conversation-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #1d4ed8;
  font-size: 13.5px;
}

.conversation-card__icon {
  font-size: 15px;
}

.conversation-card__desc {
  margin: 0;
  color: #475569;
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}

.conversation-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.conversation-card__foot time {
  color: #94a3b8;
  font-size: 11.5px;
}

/* 卡片脚上的按钮组：时间在左、按钮在右，按钮之间的间距交给 gap。
   相邻间距原来还要清掉 Element Plus 给两个 el-button 叠的那层 margin-left，
   换成 TButton 之后组件本身不产生外边距，那条规则随之删掉。 */
.conversation-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.conversation-card .conversation-card__action {
  min-height: 32px;
}

@media (max-width: 640px) {
  .conversation-card {
    /* 手机上也要看得出卡片靠哪一侧：留出与气泡同一量级的对侧空档，
       满宽铺开会让「我方发起 / 对方发起 / 平台通知」三种摆法长得一模一样。 */
    width: calc(100% - 34px);
    padding: 10px 12px;
  }

  /* 平台通知没有卡片外框，也就不需要对侧空档：文字居中本身就是它的位置。 */
  .conversation-card--system {
    width: 100%;
    padding: 0;
  }

  /* 外观 32px，触摸目标靠伪元素上下各扩 6px 凑足 44px */
  .conversation-card .conversation-card__action {
    position: relative;
    min-height: 32px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 13px;
  }

  .conversation-card .conversation-card__action::after {
    content: '';
    position: absolute;
    inset: -6px 0;
  }
}

@media (max-width: 640px) {
  .conversation-message {
    margin-bottom: 8px;
  }

  .conversation-message__bubble {
    min-width: 98px;
    padding: 9px 11px 7px;
  }

  .conversation-message__bubble p,
  .conversation-message--mine .conversation-message__bubble p {
    font-size: 14px;
  }
}

/* 历史沟通未公开提示：贴在消息列表顶部，说明接手前那段为何看不到 */
.conversation-history-notice {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  width: 100%;
  max-width: 880px;
  margin: 0 auto 14px;
  padding: 12px 14px;
  border: 1px dashed rgba(180, 143, 60, 0.42);
  border-radius: 12px;
  background: rgba(255, 252, 244, 0.94);
}

.conversation-history-notice strong {
  color: #92400e;
  font-size: 13px;
}

.conversation-history-notice p {
  margin: 0;
  color: #78594a;
  font-size: 12.5px;
  line-height: 1.6;
}

.conversation-history-notice__segments {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.conversation-history-notice__segments li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  color: #475569;
  font-size: 12px;
}

.conversation-history-notice__segments small {
  color: #94a3b8;
  font-size: 11.5px;
}

.conversation-history-notice__segments em {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
}

.conversation-history-notice__action {
  justify-self: start;
  min-height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: #2d76ec;
  color: #ffffff;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.conversation-history-notice__action:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.conversation-history-notice__tip {
  color: #64748b;
}

/* 待我确认的公开申请：会话通道上方一条确认条 */
.conversation-history-vote {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid rgba(216, 228, 244, 0.95);
  background: #fffaf0;
}

.conversation-history-vote p {
  margin: 0;
  color: #78594a;
  font-size: 12.5px;
  line-height: 1.6;
}

.conversation-history-vote__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.conversation-history-vote__actions button {
  min-height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.conversation-history-vote__actions button:first-child {
  border-color: #2d76ec;
  background: #2d76ec;
  color: #ffffff;
}

.conversation-history-vote__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 被公开的历史消息：标出这是前任开发者发的 */
.conversation-message__history-tag {
  align-self: flex-start;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(245, 158, 11, 0.16);
  color: #92400e;
  font-size: 10.5px;
  font-weight: 800;
  line-height: 1.5;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .conversation-history-notice {
    width: 100%;
    margin-bottom: 10px;
    padding: 10px 12px;
  }

  /* 移动端触摸目标 ≥44px */
  .conversation-history-notice__action,
  .conversation-history-vote__actions button {
    min-height: 44px;
  }

  .conversation-history-notice__segments em {
    margin-left: 0;
  }
}
/* 需求详情抽屉：从右侧划出、盖在会话之上。定位用 fixed——内嵌形态（消息中心）下
   也要贴着视口右侧划出，不能依赖外层容器的定位；抽屉整棵 Teleport 到 body（见模板注释），
   所以这里的层级是相对站点外壳算的：
   压过会话弹窗（130）、个人中心浮层（120）、吸顶导航（40）与移动端底部坞（60），
   但仍要留在验收弹窗（1400）这些从会话里点开的弹窗之下。 */
.conversation-drawer-layer {
  position: fixed;
  inset: 0;
  z-index: 200;
}

.conversation-drawer__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.28);
}

.conversation-drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(380px, 100%);
  border-left: 1px solid rgba(213, 226, 244, 0.98);
  background: #ffffff;
  box-shadow: -12px 0 28px rgba(30, 58, 107, 0.12);
}

/* 划出：遮罩淡入 + 面板从右侧推入。过渡类落在 layer 上，面板靠后代选择器跟着动。 */
.conversation-drawer-enter-active,
.conversation-drawer-leave-active {
  transition: opacity 200ms ease;
}

.conversation-drawer-enter-active .conversation-drawer,
.conversation-drawer-leave-active .conversation-drawer {
  transition: transform 220ms ease;
}

.conversation-drawer-enter-from,
.conversation-drawer-leave-to {
  opacity: 0;
}

.conversation-drawer-enter-from .conversation-drawer,
.conversation-drawer-leave-to .conversation-drawer {
  transform: translateX(100%);
}

.conversation-drawer__head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 12px 18px;
  border-bottom: 1px solid rgba(216, 228, 244, 0.95);
}

.conversation-drawer__head h4 {
  margin: 0;
  color: #0f172a;
  font-size: 15px;
}

.conversation-drawer__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 14px 18px 18px;
}

.conversation-drawer__title {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  line-height: 1.4;
}

.conversation-drawer__hint {
  margin: 0;
  color: #64748b;
  font-size: 13px;
}

.conversation-drawer__meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 14px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f8fafc;
}

.conversation-drawer__meta div {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.conversation-drawer__meta dt {
  color: #94a3b8;
  font-size: 11px;
  line-height: 1.4;
}

.conversation-drawer__meta dd {
  margin: 0;
  overflow: hidden;
  color: #0f172a;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-drawer__block {
  display: grid;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid rgba(226, 232, 240, 0.9);
}

.conversation-drawer__block h6 {
  margin: 0;
  color: #475569;
  font-size: 12px;
}

.conversation-drawer__rich {
  color: #334155;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.conversation-drawer__rich :deep(*:not(a)) {
  color: inherit;
}

.conversation-drawer__rich :deep(strong),
.conversation-drawer__rich :deep(b) {
  color: #1e293b;
  font-weight: 700;
}

.conversation-drawer__rich :deep(p),
.conversation-drawer__rich :deep(ul),
.conversation-drawer__rich :deep(ol),
.conversation-drawer__rich :deep(blockquote) {
  margin: 0 0 10px;
}

.conversation-drawer__rich :deep(ul),
.conversation-drawer__rich :deep(ol) {
  padding-left: 20px;
}

.conversation-drawer__rich :deep(a) {
  color: #2563eb;
  font-weight: 600;
}

.conversation-drawer__rich :deep(pre) {
  overflow-x: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

.conversation-drawer__rich :deep(.rich-editor-media) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 10px 0;
  border-radius: 12px;
}

.conversation-drawer__rich :deep(.rich-editor-attachment) {
  display: inline-flex;
  max-width: 100%;
  margin: 8px 0;
  padding: 8px 12px;
  border: 1px solid rgba(191, 219, 254, 0.96);
  border-radius: 10px;
  background: rgba(239, 246, 255, 0.9);
  color: #1d4ed8;
  font-weight: 800;
  text-decoration: none;
}

@media (max-width: 640px) {
  .conversation-drawer {
    width: 100%;
  }
}

.conversation-modal__header-actions .conversation-modal__icon-btn.is-active {
  border-color: rgba(79, 140, 255, 0.9);
  color: #1f4ad1;
}

/* === 会话头搬进工作台顶栏（移动端内嵌形态）===
   一行：返回 · 头像 · 标题/对方与状态 · 详情 · 刷新；不带卡片底色与分隔线，顶栏自己是白底。
   带 id 的选择器压过上面各层 ≤640 规则里的竖排、按钮撑满等写法。 */
#workbench-mobile-bar-extra .conversation-modal__header {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

/* 顶栏里不放返回、详情、刷新：返回走系统返回 / 左侧菜单，详情点头像或标题进入，刷新靠实时同步 */
#workbench-mobile-bar-extra .conversation-modal__back,
#workbench-mobile-bar-extra .conversation-modal__header-actions {
  display: none;
}

#workbench-mobile-bar-extra .conversation-modal__avatar {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  font-size: 14px;
  cursor: pointer;
}

#workbench-mobile-bar-extra .conversation-modal__identity {
  cursor: pointer;
}

#workbench-mobile-bar-extra .conversation-modal__identity:focus-visible {
  border-radius: 6px;
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}

/* 实时状态只留彩色圆点：文字字号归零，读屏仍能读到；后面的间隔点一并去掉 */
#workbench-mobile-bar-extra .conversation-modal__live {
  gap: 0;
  font-size: 0;
}

#workbench-mobile-bar-extra .conversation-modal__identity-meta > .conversation-modal__live::after {
  content: none;
}

/* 不换行的长标题会把最小内容宽度一路往上报，撑宽工作台主区；contain 让这一块不参与外层的内容宽度计算 */
#workbench-mobile-bar-extra .conversation-modal__identity {
  flex: 1 1 auto;
  min-width: 0;
  gap: 1px;
  contain: inline-size;
}

#workbench-mobile-bar-extra .conversation-modal__identity h3 {
  overflow: hidden;
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#workbench-mobile-bar-extra .conversation-modal__identity-meta {
  flex-wrap: nowrap;
  overflow: hidden;
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}

#workbench-mobile-bar-extra .conversation-modal__peer {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
}

#workbench-mobile-bar-extra .conversation-modal__recent {
  display: none;
}

/* === 输入区：上一行业务入口，下一行「表情 · 附件 · 输入框 · 发送」同一水平线 ===
   发送键已挪进输入行，底栏不再需要给它留第二列。 */
.conversation-modal__composer {
  grid-template-columns: minmax(0, 1fr);
}

.conversation-modal__input-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.conversation-modal__input-row .conversation-modal__input-shell {
  flex: 1 1 auto;
  min-width: 0;
}

.conversation-modal__input-row .conversation-modal__tool-btn,
.conversation-modal__input-row .conversation-modal__send-btn {
  flex: 0 0 auto;
}

/* 输入框可长高（高度由 resizeDraftInput 写在行内）：外壳不再钉死高度，单行时靠 min-height
   与 align-items:center 居中；多行时胶囊圆角会变成「药丸」，改用固定圆角 */
.conversation-modal__input-row {
  align-items: flex-end;
}

.conversation-modal__composer .conversation-modal__input-row .conversation-modal__input-shell {
  height: auto;
  padding: 8px 9px 8px 15px;
  border-radius: 20px;
}

/* textarea 自身 overflow 不可见、内边距为 0 时，光标落在首字前会被左缘裁掉：
   左右各留 3px 给光标，外壳内边距同步减 3px，文字位置不变 */
.conversation-modal__composer .conversation-modal__input-row .conversation-modal__input-shell textarea {
  max-height: none;
  padding-right: 3px;
  padding-left: 3px;
}

/* 业务入口条：上移 20px 叠在消息区底部，底色自上而下由透明渐变到消息区底色，
   聊天记录在按钮后面淡出而不是被一刀切断；透明的那一截不拦点击，消息区底部
   多留同样的高度，最后一条卡片仍能完整滚出来 */
.conversation-modal__tools {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  margin-top: -20px;
  padding: 20px 14px 8px;
  background: linear-gradient(180deg, rgba(237, 245, 252, 0) 0, rgba(237, 245, 252, 0.92) 20px, #edf5fc 100%);
  pointer-events: none;
}

.conversation-modal__tools > * {
  pointer-events: auto;
}

/* 消息区顶部同样淡出：用遮罩让最上面 24px 的内容渐隐，不另叠色块，背景怎么变都对得上；
   滚动条隐藏，滚轮、触摸与键盘滚动不受影响 */
.conversation-modal__messages {
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 24px);
  mask-image: linear-gradient(180deg, transparent 0, #000 24px);
  scrollbar-width: none;
}

.conversation-modal__messages::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

.conversation-modal__messages:has(+ .conversation-modal__tools),
.conversation-modal__messages:has(~ .conversation-modal__tools) {
  padding-bottom: 40px;
}

.conversation-modal__tools:empty {
  display: none;
}

/* 会话通栏的断点与「会话头搬进顶栏」一致（WORKBENCH_BAR_MEDIA，≤900px）：会话头一进顶栏，
   会话就得贴着顶栏铺满，否则 641–900px 之间会剩一张带圆角、上下留缝的卡片，顶部渐隐也会显得发虚 */
@media (max-width: 900px) {
  /* 会话通栏：抵掉工作台主区左右各 8px 的内边距，左右不留边、不要圆角与侧边框 */
  .conversation-modal-wrap--inline .conversation-modal {
    width: calc(100% + 16px);
    max-width: none;
    /* 会话头已搬进顶栏，会话直接贴在顶栏下：上外边距 -20px 抵掉顶栏下外边距 8px 与内容区上内边距 12px；
       高度只扣顶栏 53px，会话打开时底部快捷导航已隐藏，不再预留 */
    height: calc(100dvh - 54px);
    min-height: min(440px, calc(100dvh - 54px));
    max-height: calc(100dvh - 54px);
    margin: -20px -8px 0;
    border-top: 0;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    box-shadow: none;
  }
}

@media (max-width: 640px) {
  .conversation-modal__composer {
    padding: 8px 10px calc(8px + env(safe-area-inset-bottom, 0px));
  }

  .conversation-modal__composer .conversation-modal__tool-btn {
    width: 34px;
    height: 34px;
    box-shadow: none;
  }

  .conversation-modal__composer .conversation-modal__input-row .conversation-modal__input-shell {
    padding-right: 11px;
    padding-left: 11px;
  }

  .conversation-modal__composer .conversation-modal__input-shell {
    min-height: 40px;
    height: 40px;
    padding-right: 14px;
  }

  /* 发送键与表情、附件同为 34px；输入框单行高 40px，三颗按钮底边各抬 3px，
     单行时与输入框中线对齐，多行时仍贴着最后一行 */
  .conversation-modal__composer .conversation-modal__send-btn {
    width: 34px;
    min-width: 34px;
    height: 34px;
    box-shadow: none;
  }

  .conversation-modal__input-row .conversation-modal__tool-btn,
  .conversation-modal__input-row .conversation-modal__send-btn {
    margin-bottom: 3px;
  }
}

/* R014：到期归档后会话只读的提示条。放在作曲器顶部，讲清「只读但历史可看可下载」。 */
.conversation-modal__readonly-hint {
  margin: 0 0 8px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
