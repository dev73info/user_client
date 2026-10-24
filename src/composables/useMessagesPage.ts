import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { TMessage } from 'ui_73info'
import {
  listRequirementConversations,
  subscribeRequirementConversationEvents,
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/api/conversations'
import { listRequirements, type RequirementItem } from '@/api/requirements'
import { useMessagesHistoryVotes } from '@/composables/useMessagesHistoryVotes'
import { useMessagesThreads } from '@/composables/useMessagesThreads'
import { CONVERSATION_READ_EVENT } from '@/shared/conversationEvents'
import type { MessageThread } from '@/shared/messagesThreads'
import { useAuthStore } from '@/stores/auth'

/**
 * 消息中心的页面装配：取数、实时订阅、打开会话、以及三个入口的路由名。
 *
 * 页面里唯一「往哪儿跳」的决定也在这里：打开会话写的是**路由 query**（`?requirement_id=`），
 * 不是页内变量——三个入口（独立 /messages、用户工作台、开发者工作台）各有自己的路由名，
 * 刷新与分享都靠这个 query 复原现场。列表行的拼装与筛选分页见 `useMessagesThreads`，
 * 历史沟通公开申请的表决见 `useMessagesHistoryVotes`。
 *
 * 视图与区块组件只拿结果渲染，不碰 router / TMessage / 接口。
 */
export function useMessagesPage() {
  const router = useRouter()
  const route = useRoute()
  const auth = useAuthStore()
  const votes = useMessagesHistoryVotes()

  // 本页被三个入口共用：用户工作台、开发者工作台、独立 /messages。
  // 开发者工作台模式下骨架与其余菜单页完全一致——顶部读数条带页面级刷新、卡片头只留标题与
  // 实时状态、搜索与筛选同处一行、列表行走 .dev-stack-item。门户模式保持原来的版式不动，
  // 两套结构各自渲染，不再用一段 .user-workbench--dev 覆盖把门户的 DOM「近似」成开发者外观。
  const isDevWorkbench = computed(() =>
    route.matched.some((record) => Boolean(record.meta.devArea)),
  )

  const loading = ref(false)
  const conversations = ref<RequirementConversation[]>([])
  const requirements = ref<RequirementItem[]>([])
  const activeRequirementId = ref('')
  const activeTitle = ref('')
  let stopRealtimeEvents: (() => void) | null = null

  const username = computed(() => auth.username)
  const threads = useMessagesThreads({ conversations, requirements, username })

  // 消息中心有三个入口，页面内切换会话时保持停留在当前入口，避免把开发者带回用户工作台。
  const MESSAGES_ROUTE_NAMES = ['messages', 'workbench-messages', 'dev-messages']
  const currentMessagesRouteName = computed(() =>
    MESSAGES_ROUTE_NAMES.includes(String(route.name ?? ''))
      ? String(route.name)
      : 'workbench-messages',
  )

  function showThread(item: MessageThread) {
    activeRequirementId.value = item.requirementId
    activeTitle.value = item.title
  }

  function openThread(item: MessageThread) {
    if (
      MESSAGES_ROUTE_NAMES.includes(String(route.name ?? '')) &&
      route.query.requirement_id === item.requirementId
    ) {
      showThread(item)
      return
    }

    void router.push({
      name: currentMessagesRouteName.value,
      query: {
        requirement_id: item.requirementId,
      },
    })
  }

  function openThreadFromRoute() {
    const requirementId =
      typeof route.query.requirement_id === 'string' ? route.query.requirement_id : ''
    if (!requirementId) {
      activeRequirementId.value = ''
      activeTitle.value = ''
      return
    }

    const thread = threads.allThreads.value.find((item) => item.requirementId === requirementId)
    if (!thread) {
      return
    }

    showThread(thread)
  }

  function closeConversation() {
    void router.push({ name: currentMessagesRouteName.value })
  }

  /**
   * 会话标记已读后广播过来（见 shared/conversationEvents）：把这一行的未读数就地清零。
   *
   * 不重取整个列表：用户刚看完的那条会话必然是这一行，别的行没变；
   * 工作台外壳那份角标会自己重取（它要和子菜单一起刷新）。
   */
  function handleConversationRead(event: Event) {
    const detail = (event as CustomEvent<{ conversationId?: string }>).detail
    if (!detail?.conversationId) {
      return
    }

    conversations.value = conversations.value.map((item) =>
      item.conversation_id === detail.conversationId ? { ...item, unread_count: 0 } : item,
    )
  }

  /** 会话有更新（实时推送或弹窗里发完消息）：就地把这一行换掉，没有再补到最前面。 */
  function applyConversationDetail(payload: RequirementConversationDetail) {
    const nextConversation = payload.conversation
    const index = conversations.value.findIndex(
      (item) => item.requirement_id === nextConversation.requirement_id,
    )
    if (index >= 0) {
      conversations.value = conversations.value.map((item, itemIndex) =>
        itemIndex === index ? nextConversation : item,
      )
      return
    }

    conversations.value = [nextConversation, ...conversations.value]
  }

  function disconnectRealtime() {
    if (stopRealtimeEvents) {
      stopRealtimeEvents()
      stopRealtimeEvents = null
    }
  }

  function connectRealtime() {
    disconnectRealtime()
    if (!auth.token.trim()) {
      return
    }

    stopRealtimeEvents = subscribeRequirementConversationEvents(auth.token, {
      onUpdate: (payload) => {
        applyConversationDetail(payload)
        openThreadFromRoute()
      },
    })
  }

  async function loadMessages(showSuccess = false) {
    auth.hydrate()
    if (!auth.token.trim()) {
      conversations.value = []
      requirements.value = []
      votes.clear()
      disconnectRealtime()
      return
    }

    loading.value = true
    try {
      const [nextRequirements, nextConversations] = await Promise.all([
        listRequirements(auth.token),
        listRequirementConversations(auth.token),
        // 待办是前任开发者在消息中心唯一的表决入口（他读不到会话本身），
        // 拉取要与会话列表并列，不能被那两个请求的失败带着一起跳过
        votes.load(),
      ])
      requirements.value = nextRequirements
      conversations.value = nextConversations
      openThreadFromRoute()
      if (showSuccess) {
        TMessage.success('消息已刷新')
      }
    } catch (error) {
      TMessage.error(error instanceof Error ? error.message : '加载消息失败')
    } finally {
      loading.value = false
    }
  }

  /** 顶部读数条右侧那颗页面级刷新：与首屏同一条链路，成功后给一句轻提示。 */
  function refresh() {
    return loadMessages(true)
  }

  onMounted(async () => {
    window.addEventListener(CONVERSATION_READ_EVENT, handleConversationRead)
    await loadMessages()
    connectRealtime()
  })

  onBeforeUnmount(() => {
    window.removeEventListener(CONVERSATION_READ_EVENT, handleConversationRead)
    disconnectRealtime()
  })

  watch(
    () => route.query.requirement_id,
    () => {
      openThreadFromRoute()
    },
  )

  watch(
    () => auth.token,
    () => {
      connectRealtime()
    },
  )

  return {
    isDevWorkbench,
    loading,
    // 列表与筛选分页（useMessagesThreads）
    ...threads,
    // 内嵌会话
    activeRequirementId,
    activeTitle,
    token: computed(() => auth.token),
    username,
    // 历史沟通公开申请
    pendingHistoryVotes: votes.pendingVotes,
    historyVotingId: votes.votingId,
    respondHistoryDisclosure: votes.respond,
    // 动作
    refresh,
    openThread,
    closeConversation,
    applyConversationDetail,
  }
}
