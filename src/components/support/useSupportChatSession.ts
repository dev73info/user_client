import { ref, watch } from 'vue'

import {
  createSupportConversation,
  getSupportConversationDetail,
  listPublicSupportChannels,
  sendSupportMessage,
  supportConversationWsUrl,
  type SupportConversation,
  type SupportConversationDetail,
} from '@/api/support'
import { useSupportChatAttachments } from './useSupportChatAttachments'
import { useSupportChatAvailability } from './useSupportChatAvailability'
import { useSupportChatCredential } from './useSupportChatCredential'
import { useSupportChatMessages } from './useSupportChatMessages'
import { useSupportChatRealtime } from './useSupportChatRealtime'
import { useSupportChatSatisfaction } from './useSupportChatSatisfaction'
import { useSupportUnread } from './useSupportUnread'
const REALTIME_UNAVAILABLE_MESSAGE = '实时连接已断开，消息仍可正常发送'
export function useSupportChatSession() {
  const credential = useSupportChatCredential()
  const { auth, guest, token: supportToken, isGuest } = credential
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
  const attachments = useSupportChatAttachments(() => supportToken.value)
  const satisfaction = useSupportChatSatisfaction(
    () => supportToken.value,
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
  } = useSupportUnread(() => supportToken.value)

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

  function resetTransientState() {
    realtime.disconnect()
    stopUnread()
    clearActiveConversation()
    historyOpen.value = false
    unavailable.value = false
    messages.value = []
    input.value = ''
    error.value = ''
    attachments.clear()
    loading.value = false
    sending.value = false
  }

  async function syncActiveConversation() {
    const id = activeConversationId.value
    const token = supportToken.value.trim()
    if (!opened.value || id === null || !token) return
    try {
      const detail = await getSupportConversationDetail(token, id)
      if (activeConversationId.value === id && supportToken.value.trim() === token) {
        activeConversation.value = detail.conversation
        setMessages(detail.messages)
        activeStatus.value = toStatus(detail.conversation.status)
      }
    } catch {
      /* 已读同步失败保留未读，下一次打开或重连再试。 */
    }
  }

  function receiveDetail(detail: SupportConversationDetail) {
    if (activeConversationId.value === null) activeConversationId.value = detail.conversation.id
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
      channelEnabled.value && supportToken.value.trim()
        ? supportConversationWsUrl(supportToken.value)
        : null,
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
      resetTransientState()
      supportToken.value = token.trim() || guest.session.value?.token || ''
      if (!channelEnabled.value) return
      if (opened.value) {
        void openCurrentConversation()
      } else if (supportToken.value) {
        realtime.connect()
        startUnread()
      }
    },
  )

  async function openCurrentConversation() {
    if (loading.value) return
    loading.value = true
    error.value = ''
    try {
      await credential.ensure()
      if (disposed || !opened.value) return
      realtime.connect()
      startUnread()
      await loadConversationForToken(supportToken.value)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载客服会话失败'
    } finally {
      if (!disposed) loading.value = false
    }
  }
  async function loadConversationForToken(token: string) {
    const list = await refreshConversations()
    if (supportToken.value !== token || !opened.value) return
    const current = list.find((item) => item.status === 'open')
    if (!current) {
      clearActiveConversation()
      messages.value = []
      return
    }
    const detail = await getSupportConversationDetail(token, current.id)
    if (supportToken.value !== token) return
    setActiveConversation(detail.conversation)
    setMessages(detail.messages)
  }

  async function openConversation(id: number) {
    const target = conversations.value.find((item) => item.id === id)
    if (!target || loading.value) return
    historyOpen.value = false
    loading.value = true
    error.value = ''
    try {
      const token = await credential.ensure()
      const detail = await getSupportConversationDetail(token, id)
      if (supportToken.value !== token) return
      setActiveConversation(detail.conversation)
      setMessages(detail.messages)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '加载会话失败'
    } finally {
      loading.value = false
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
    await openCurrentConversation()
  }

  async function send(textOverride?: string) {
    const text = (textOverride ?? input.value).trim()
    const attachmentIds = attachments.pending.value.map((attachment) => attachment.id)
    if ((!text && attachmentIds.length === 0) || loading.value || sending.value || disposed) return
    sending.value = true
    error.value = ''
    try {
      const token = await credential.ensure()
      if (disposed || supportToken.value !== token) return
      const canContinue = activeConversationId.value !== null && activeStatus.value === 'open'
      const id = canContinue
        ? activeConversationId.value!
        : (await createSupportConversation(token, text, attachmentIds)).id
      if (supportToken.value !== token) return
      activeConversationId.value = id
      activeStatus.value = 'open'
      if (canContinue) {
        const sent = await sendSupportMessage(token, id, text, attachmentIds)
        if (supportToken.value !== token) return
        appendMessage(sent)
      } else {
        const detail = await getSupportConversationDetail(token, id)
        if (supportToken.value !== token) return
        setActiveConversation(detail.conversation)
        setMessages(detail.messages)
      }
      input.value = ''
      attachments.clear()
      void refreshConversations()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '发送消息失败'
    } finally {
      sending.value = false
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
    if (!disposed && channelEnabled.value && supportToken.value) {
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
    supportToken,
    isGuest,
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
