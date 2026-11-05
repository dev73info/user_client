import { nextTick, ref, watch } from 'vue'

import {
  createSupportConversation,
  getSupportConversationDetail,
  listPublicSupportChannels,
  sendSupportMessage,
  supportConversationWsUrl,
  type SupportConversationDetail,
  type SupportMessage,
} from '@/api/support'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'

import { useSupportChatRealtime } from './useSupportChatRealtime'
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
  const historyOpen = ref(false)
  const unavailable = ref(false)
  const messages = ref<Array<SupportMessage & { time: string }>>([])
  const chatBodyRef = ref<HTMLElement | null>(null)
  const input = ref('')
  const error = ref('')
  let disposed = false

  const {
    conversations,
    unread,
    refresh: refreshConversations,
    start: startUnread,
    stop: stopUnread,
  } = useSupportUnread()

  function setChatBodyRef(el: unknown) {
    chatBodyRef.value = (el as HTMLElement | null) ?? null
  }

  function formatTime(value: string): string {
    const date = parseBackendDateTime(value)
    return date?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) ?? ''
  }

  /** 契约里的 status 是 string；面板只区分「进行中 / 已结束」。 */
  function toStatus(value: string): 'open' | 'closed' {
    return value === 'closed' ? 'closed' : 'open'
  }

  async function scrollToBottom() {
    await nextTick()
    if (chatBodyRef.value) chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }

  function setMessages(items: SupportMessage[]) {
    messages.value = items.map((message) => ({
      ...message,
      time: formatTime(message.created_at),
    }))
    void scrollToBottom()
  }

  async function syncActiveConversation() {
    const id = activeConversationId.value
    const token = auth.token.trim()
    if (!opened.value || id === null || !token) return
    try {
      const detail = await getSupportConversationDetail(token, id)
      if (activeConversationId.value === id && auth.token.trim() === token) {
        setMessages(detail.messages)
        activeStatus.value = toStatus(detail.conversation.status)
      }
    } catch {
      // 已读同步失败保留未读，下一次打开或重连再试。
    }
  }

  function receiveDetail(detail: SupportConversationDetail) {
    activeConversationId.value ??= detail.conversation.id
    if (activeConversationId.value !== detail.conversation.id) return
    activeStatus.value = toStatus(detail.conversation.status)
    setMessages(detail.messages)
    // 面板关着时也要把未读角标刷出来，不能等下一次 30s 轮询。
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
      activeConversationId.value = null
      activeStatus.value = null
      historyOpen.value = false
      unavailable.value = false
      messages.value = []
      input.value = ''
      error.value = ''
      opened.value = false
      loading.value = false
      sending.value = false
      if (token.trim() && channelEnabled.value) {
        realtime.connect()
        startUnread()
      }
    },
  )

  /** 打开面板时只接管「进行中」的会话；只有已结束会话时不自动续用，发送会自动新建。 */
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
        activeConversationId.value = null
        activeStatus.value = null
        messages.value = []
        return
      }
      const detail = await getSupportConversationDetail(token, current.id)
      if (auth.token.trim() !== token) return
      activeConversationId.value = current.id
      activeStatus.value = toStatus(current.status)
      setMessages(detail.messages)
    } catch (cause) {
      if (auth.token.trim() === token) {
        error.value = cause instanceof Error ? cause.message : '加载会话失败'
      }
    } finally {
      if (auth.token.trim() === token) loading.value = false
    }
  }

  /** 从历史会话里打开一条；已结束的只读展示，发送时会新建会话。 */
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
      activeConversationId.value = id
      activeStatus.value = toStatus(target.status)
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
    if (!text || loading.value || sending.value || disposed) return
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
        : (await createSupportConversation(token, text)).id
      if (auth.token.trim() !== token) return
      activeConversationId.value = id
      activeStatus.value = 'open'
      if (canContinue) {
        const sent = await sendSupportMessage(token, id, text)
        if (auth.token.trim() !== token) return
        if (!messages.value.some((message) => message.id === sent.id)) {
          messages.value.push({ ...sent, time: formatTime(sent.created_at) })
        }
        await scrollToBottom()
      } else {
        const detail = await getSupportConversationDetail(token, id)
        if (auth.token.trim() !== token) return
        setMessages(detail.messages)
      }
      input.value = ''
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
    return channelEnabled.value
  }

  function dispose() {
    disposed = true
    stopAuthWatch()
    stopUnread()
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
    connected: realtime.connected,
    conversations,
    unread,
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
