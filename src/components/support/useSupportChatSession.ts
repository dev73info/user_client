import { nextTick, ref, watch } from 'vue'

import {
  createSupportConversation,
  getSupportConversationDetail,
  listMySupportConversations,
  listPublicSupportChannels,
  sendSupportMessage,
  supportConversationWsUrl,
  type SupportConversationDetail,
  type SupportMessage,
} from '@/api/support'
import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'

import { useSupportChatRealtime } from './useSupportChatRealtime'

const LOGIN_REQUIRED_MESSAGE = '请先登录后再使用在线客服'

export function useSupportChatSession() {
  const auth = useAuthStore()
  const channelEnabled = ref(false)
  const opened = ref(false)
  const loading = ref(false)
  const sending = ref(false)
  const activeConversationId = ref<number | null>(null)
  const messages = ref<Array<SupportMessage & { time: string }>>([])
  const chatBodyRef = ref<HTMLElement | null>(null)
  const input = ref('')
  const error = ref('')
  let disposed = false

  function setChatBodyRef(el: unknown) {
    chatBodyRef.value = (el as HTMLElement | null) ?? null
  }

  function formatTime(value: string): string {
    const date = parseBackendDateTime(value)
    return date?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) ?? ''
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
      }
    } catch {
      // 已读同步失败保留未读，下一次打开或重连再试。
    }
  }

  function receiveDetail(detail: SupportConversationDetail) {
    activeConversationId.value ??= detail.conversation.id
    if (activeConversationId.value !== detail.conversation.id) return
    setMessages(detail.messages)
    if (!opened.value) return
    const lastRead = detail.conversation.user_last_read_message_id ?? 0
    const maxId = detail.messages.reduce((max, message) => Math.max(max, message.id), 0)
    if (maxId > lastRead) void syncActiveConversation()
  }

  const realtime = useSupportChatRealtime({
    url: () =>
      channelEnabled.value && auth.token.trim() ? supportConversationWsUrl(auth.token) : null,
    onOpen: () => {
      void syncActiveConversation()
    },
    onDetail: receiveDetail,
  })

  const stopAuthWatch = watch(
    () => auth.token,
    (token, previousToken) => {
      if (token === previousToken) return
      realtime.disconnect()
      activeConversationId.value = null
      messages.value = []
      input.value = ''
      error.value = ''
      opened.value = false
      loading.value = false
      sending.value = false
      if (token.trim() && channelEnabled.value) realtime.connect()
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
      const list = await listMySupportConversations(token)
      if (auth.token.trim() !== token || !opened.value) return
      const current = list.find((item) => item.status === 'open') ?? list[0]
      if (!current) {
        activeConversationId.value = null
        messages.value = []
        return
      }
      const detail = await getSupportConversationDetail(token, current.id)
      if (auth.token.trim() !== token) return
      activeConversationId.value = current.id
      setMessages(detail.messages)
    } catch (cause) {
      if (auth.token.trim() === token) {
        error.value = cause instanceof Error ? cause.message : '加载会话失败'
      }
    } finally {
      if (auth.token.trim() === token) loading.value = false
    }
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
      const hadConversation = activeConversationId.value !== null
      const id = hadConversation
        ? activeConversationId.value!
        : (await createSupportConversation(token, text)).id
      if (auth.token.trim() !== token) return
      activeConversationId.value = id
      if (hadConversation) {
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
    if (!disposed && channelEnabled.value && auth.token.trim()) realtime.connect()
    return channelEnabled.value
  }

  function dispose() {
    disposed = true
    stopAuthWatch()
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
    setChatBodyRef,
    toggleOpen,
    send,
    resolveChannelEnabled,
    dispose,
  }
}
