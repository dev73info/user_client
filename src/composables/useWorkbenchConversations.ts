import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { listRequirementConversations, type RequirementConversation } from '@/api/conversations'
import { CONVERSATION_READ_EVENT } from '@/shared/conversationEvents'
import {
  countUnreadMessages,
  sortConversationsByRecency,
  unreadCountText,
} from '@/shared/workbenchDisplay'
import { isMessagesRouteName } from '@/shared/workbenchRoutes'
import { useAuthStore } from '@/stores/auth'

import { TMessage } from 'ui_73info'

/** 侧边栏「消息中心」里直接列出的最近会话条数，剩下的收进「查看全部消息」。 */
const VISIBLE_CONVERSATION_COUNT = 3

/**
 * 侧边栏消息中心：会话列表、未读角标与「当前打开的是哪一条」。
 *
 * 从 `views/UserWorkbenchView.vue` 抽出来。会话本身在 `RequirementConversationModal` 里打开，
 * 与外壳没有父子关系，所以已读之后靠 `CONVERSATION_READ_EVENT` 广播回来重取一次，
 * 未读角标与子菜单里的未读小标随即可对齐服务端。
 */
export function useWorkbenchConversations() {
  const auth = useAuthStore()
  const route = useRoute()

  const conversations = ref<RequirementConversation[]>([])
  const conversationLoading = ref(false)

  const sortedConversations = computed(() => sortConversationsByRecency(conversations.value))
  const visibleConversations = computed(() =>
    sortedConversations.value.slice(0, VISIBLE_CONVERSATION_COUNT),
  )
  const hiddenConversationCount = computed(() =>
    Math.max(sortedConversations.value.length - visibleConversations.value.length, 0),
  )

  /**
   * 消息中心角标：未读消息总数。
   *
   * 后端按「双方各自最后已读的消息 id」算出每条会话里查看者未读的消息数（`unread_count`），
   * 这里求和。以前没有已读状态，角标只能拿「最后一条不是我发的且会话仍开着」的会话条数顶替，
   * 那种口径既不区分我是否已经看过，数的也不是消息。
   */
  const unreadMessageCount = computed(() => countUnreadMessages(conversations.value))

  /** 角标读数：超过 99 收成 99+，免得把菜单标题挤走 */
  const unreadBadgeText = computed(() => unreadCountText(unreadMessageCount.value))

  /** 地址栏里那个需求号（`?requirement_id=`）：会话行据此判高亮，顶栏据此取会话名。 */
  const activeRequirementId = computed(() => {
    const requirementId = route.query.requirement_id
    return typeof requirementId === 'string' ? requirementId : ''
  })

  const activeConversation = computed(
    () =>
      conversations.value.find((item) => item.requirement_id === activeRequirementId.value) ?? null,
  )

  /**
   * 会话被打开并标记已读后会广播一次（见 shared/conversationEvents）：会话本身在
   * `RequirementConversationModal` 里打开，与这个外壳没有父子关系，所以只能靠事件通知。
   * 这里重取一次列表，未读角标与子菜单里的未读小标随即对齐服务端。
   */
  function handleConversationRead() {
    void loadConversations(true)
  }

  async function loadConversations(silent = false) {
    auth.hydrate()
    if (!auth.token.trim()) {
      conversations.value = []
      return
    }

    conversationLoading.value = true
    try {
      conversations.value = await listRequirementConversations(auth.token)
    } catch (error) {
      conversations.value = []
      if (!silent) {
        TMessage.error(error instanceof Error ? error.message : '加载会话菜单失败')
      }
    } finally {
      conversationLoading.value = false
    }
  }

  watch(
    () => auth.token,
    () => {
      void loadConversations()
    },
    { immediate: true },
  )

  watch(
    () => route.name,
    (name) => {
      if (isMessagesRouteName(name)) {
        void loadConversations(true)
      }
    },
  )

  onMounted(() => window.addEventListener(CONVERSATION_READ_EVENT, handleConversationRead))
  onBeforeUnmount(() => window.removeEventListener(CONVERSATION_READ_EVENT, handleConversationRead))

  return {
    // 侧边栏消息中心要用的
    visibleConversations,
    hiddenConversationCount,
    conversationLoading,
    unreadMessageCount,
    // 外壳要用的：会话总数、「暂无会话」判定与顶栏那行的会话名
    sortedConversations,
    activeConversation,
  }
}
