import { computed, ref, watch } from 'vue'

import {
  createSupportConversation,
  getSupportConversationDetail,
  listPublicSupportChannels,
  sendSupportMessage,
  supportConversationWsUrl,
  type SupportConversation,
  type SupportConversationDetail,
} from '@/api/support'
import { useAuthStore } from '@/stores/auth'
import { useSupportChatRealtime } from './useSupportChatRealtime'
import { useSupportChatAttachments } from './useSupportChatAttachments'
import { useSupportChatAvailability } from './useSupportChatAvailability'
import { useSupportChatMessages } from './useSupportChatMessages'
import { useSupportChatSatisfaction } from './useSupportChatSatisfaction'
import { useSupportUnread } from './useSupportUnread'

const LOGIN_REQUIRED_MESSAGE = '请先登录后再使用在线客服'
const REALTIME_UNAVAILABLE_MESSAGE = '实时连接已断开'

export function useSupportChatSession() {
  const auth = useAuthStore()
  const channelEnabled = ref(false)
  const opened = ref(false)
  const loading = ref(false)
  const sending = ref(false)
  const activeConversationId = ref<number | null>(null)
  const activeStatus = ref<'open' | 'closed' | null>(null)
  const activeConversation = ref<SupportConversation | null>(null)
  const historyOpen = ref(false)
  const unavailable = ref(false)
  const input = ref('')
  const error = ref('')
  let disposed = false
  const availability = useSupportChatAvailability()
  const attachments = useSupportChatAttachments(() => auth.token)
  const satisfaction = useSupportChatSatisfaction(
    () => auth.token,
    activeConversation,
    setActiveConversation,
  )
  const {
    messages,
    setBodyRef: setChatBodyRef,
    setMessages,
    appendMessage,
  } = useSupportChatMessages()
  const {
    conversations,
    unread,
    refresh: refreshConversations,
    start: startUnread,
    stop: stopUnread,
  } = useSupportUnread()
  function toStatus(value: string): 'open' | 'closed' {
    return value === 'closed' ? 'closed' : 'open'
  }

  function setActiveConversation(next: SupportConversation) {
    activeConversation.value = next
    activeConversationId.value = next.id
    activeStatus.value = toStatus(next.status)
  }

  function clearActiveConversation() {
    activeConversation.value = null
    activeConversationId.value = null
    activeStatus.value = null
  }

  async function syncActiveConversation() {
    const id = activeConversationId.value
    const token = auth.token.trim()
    if (!opened.value || id === null || !token) return
    try {
      const detail = await getSupportConversationDetail(token, id)
      if (activeConversationId.value === id && auth.token.trim() === token) {
        activeConversation.value = detail.conversation
        setMessages(detail.messages)
        activeStatus.value = toStatus(detail.conversation.status)
      }
    } catch {
      /* 已读同步失败保留未读，下一次打开或重连再试。 */
    }
  }

  function receiveDetail(detail: SupportConversationDetail) {
    activeConversationId.value ??= detail.conversation.id
    if (activeConversationId.value !== detail.conversation.id) return
    setActiveConversation(detail.conversation)
    setMessages(detail.messages)
    void refreshConversations()
    if (!opened.value) return
    const lastRead = detail.conversation.user_last_read_message_id ?? 0
    const maxId = detail.messages.reduce((max, message) => Math.max(max, message.id), 0)
    if (maxId > lastRead) void syncActiveConversation()
  }

  const realtime = useSupportChatRealtime({
    url: () =>
      channelEnabled.value && auth.token.trim() ? supportConversationWsUrl(auth.token) : null,
    onOpen: () => {
      unavailable.value = false
      void syncActiveConversation()
    },
    onDetail: receiveDetail,
    onUnavailable: () => {
      unavailable.value = true
      error.value = REALTIME_UNAVAILABLE_MESSAGE
    },
  })

  const stopAuthWatch = watch(
    () => auth.token,
    (token, previousToken) => {
      if (token === previousToken) return
      realtime.disconnect()
      clearActiveConversation()
      historyOpen.value = false
      unavailable.value = false
      messages.value = []
      input.value = ''
      error.value = ''
      attachments.clear()
      opened.value = false
      loading.value = false
      sending.value = false
      if (token.trim() && channelEnabled.value) {
        realtime.connect()
        startUnread()
      }
    },
  )

  async function ensureConversation() {
    const token = auth.token.trim()
    if (!token) {
      error.value = LOGIN_REQUIRED_MESSAGE
      return
    }
    loading.value = true
    error.value = ''
    try {
      const list = await refreshConversations()
      if (auth.token.trim() !== token || !opened.value) return
      const current = list.find((item) => item.status === 'open')
      if (!current) {
        clearActiveConversation()
        messages.value = []
        return
      }
      const detail = await getSupportConversationDetail(token, current.id)
      if (auth.token.trim() !== token) return
      setActiveConversation(detail.conversation)
      setMessages(detail.messages)
    } catch (cause) {
      if (auth.token.trim() === token) {
        error.value = cause instanceof Error ? cause.message : '加载会话失败'
      }
    } finally {
      if (auth.token.trim() === token) loading.value = false
    }
  }

  async function openConversation(id: number) {
    const token = auth.token.trim()
    const target = conversations.value.find((item) => item.id === id)
    if (!token || !target || loading.value) return
    historyOpen.value = false
    loading.value = true
    error.value = ''
    try {
      const detail = await getSupportConversationDetail(token, id)
      if (auth.token.trim() !== token) return
      setActiveConversation(detail.conversation)
      setMessages(detail.messages)
    } catch (cause) {
      if (auth.token.trim() === token) {
        error.value = cause instanceof Error ? cause.message : '加载会话失败'
      }
    } finally {
      if (auth.token.trim() === token) loading.value = false
    }
  }

  function toggleHistory() {
    historyOpen.value = !historyOpen.value
    if (historyOpen.value) void refreshConversations()
  }

  async function toggleOpen() {
    if (disposed) return
    opened.value = !opened.value
    if (!opened.value) return
    if (!auth.token.trim()) {
      error.value = LOGIN_REQUIRED_MESSAGE
      return
    }
    if (!loading.value) await ensureConversation()
  }

  async function send() {
    const text = input.value.trim()
    const attachmentIds = attachments.pending.value.map((attachment) => attachment.id)
    if ((!text && attachmentIds.length === 0) || loading.value || sending.value || disposed) return
    const token = auth.token.trim()
    if (!token) {
      error.value = LOGIN_REQUIRED_MESSAGE
      return
    }
    sending.value = true
    error.value = ''
    try {
      // 会话被客服结束后不能继续发；用这条内容新建一个会话。
      const canContinue = activeConversationId.value !== null && activeStatus.value === 'open'
      const id = canContinue
        ? activeConversationId.value!
        : (await createSupportConversation(token, text, attachmentIds)).id
      if (auth.token.trim() !== token) return
      activeConversationId.value = id
      activeStatus.value = 'open'
      if (canContinue) {
        const sent = await sendSupportMessage(token, id, text, attachmentIds)
        if (auth.token.trim() !== token) return
        appendMessage(sent)
      } else {
        const detail = await getSupportConversationDetail(token, id)
        if (auth.token.trim() !== token) return
        setMessages(detail.messages)
      }
      input.value = ''
      attachments.clear()
      void refreshConversations()
    } catch (cause) {
      if (auth.token.trim() === token) {
        error.value = cause instanceof Error ? cause.message : '发送消息失败'
      }
    } finally {
      if (auth.token.trim() === token) sending.value = false
    }
  }

  async function resolveChannelEnabled(): Promise<boolean> {
    try {
      const channels = await listPublicSupportChannels()
      const widgetChannel = channels.find((channel) => channel.channel_key === 'web_widget')
      channelEnabled.value = widgetChannel ? widgetChannel.enabled : true
    } catch {
      channelEnabled.value = true
    }
    if (!disposed && channelEnabled.value && auth.token.trim()) {
      realtime.connect()
      startUnread()
    }
    if (!disposed && channelEnabled.value) availability.start()
    return channelEnabled.value
  }

  function dispose() {
    disposed = true
    stopAuthWatch()
    stopUnread()
    availability.stop()
    realtime.disconnect()
  }

  return {
    auth,
    channelEnabled,
    opened,
    loading,
    sending,
    messages,
    input,
    error,
    authenticated: computed(() => Boolean(auth.token.trim())),
    connected: realtime.connected,
    conversations,
    unread,
    availabilityOnline: availability.online,
    availabilityLoaded: availability.loaded,
    onlineAgents: availability.onlineAgents,
    activeConversation,
    attachments,
    satisfaction,
    activeStatus,
    historyOpen,
    unavailable,
    setChatBodyRef,
    toggleOpen,
    toggleHistory,
    openConversation,
    send,
    resolveChannelEnabled,
    dispose,
  }
}
