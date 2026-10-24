/**
 * 在线客服浮窗的会话状态：渠道开关、会话列表 / 详情、发消息、滚动到底与 WebSocket 推送。
 *
 * 从 `SupportChatWidget.vue` 拆出，逻辑逐行搬移（连接、退避重连、按 id 去重、已读标记都不变）。
 * 模板侧只读这里返回的 `ref` 与动作，不另建一份状态。
 */
import { nextTick, ref } from 'vue'

import { parseBackendDateTime } from '@/shared/datetime'
import { useAuthStore } from '@/stores/auth'
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

// 重连退避：后端不可用时每次翻倍，连上后重置，避免按固定 3s 一直重连
const WS_RECONNECT_BASE_MS = 3000
const WS_RECONNECT_MAX_MS = 15_000

export function useSupportChatSession() {
  const auth = useAuthStore()

  // 客服端可在「系统设置 → 渠道配置」停用网页渠道，此时整个浮窗不展示
  const channelEnabled = ref(true)

  const opened = ref(false)
  const loading = ref(false)
  const activeConversationId = ref<number | null>(null)
  const messages = ref<Array<SupportMessage & { time: string }>>([])
  const chatBodyRef = ref<HTMLElement | null>(null)
  /** 面板里的消息容器用函数式 `ref` 注入，避免 `Ref` 类型经由 props 传递时被模板自动解包。 */
  function setChatBodyRef(el: unknown) {
    chatBodyRef.value = (el as HTMLElement | null) ?? null
  }
  const input = ref('')
  const error = ref('')
  const connected = ref(false)

  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  let wsReconnectDelayMs = WS_RECONNECT_BASE_MS

  function formatTime(value: string): string {
    // 后端时间是东八区墙钟串，口径见 shared/datetime.ts。
    const date = parseBackendDateTime(value)
    if (!date) {
      return ''
    }
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  async function scrollToBottom() {
    await nextTick()
    if (chatBodyRef.value) chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }

  function setMessages(items: SupportMessage[]) {
    messages.value = items.map((m) => ({ ...m, time: formatTime(m.created_at) }))
    void scrollToBottom()
  }

  async function ensureConversation() {
    loading.value = true
    error.value = ''
    try {
      const list = await listMySupportConversations(auth.token)
      const current = list.find((c) => c.status === 'open') ?? list[0]
      if (current) {
        activeConversationId.value = current.id
        const detail = await getSupportConversationDetail(auth.token, current.id)
        setMessages(detail.messages)
      } else {
        activeConversationId.value = null
        messages.value = []
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载会话失败'
    } finally {
      loading.value = false
    }
  }

  async function toggleOpen() {
    opened.value = !opened.value
    if (opened.value && activeConversationId.value === null && !loading.value) {
      await ensureConversation()
    }
  }

  async function send() {
    const text = input.value.trim()
    if (!text || loading.value) return
    error.value = ''
    try {
      if (activeConversationId.value === null) {
        const conv = await createSupportConversation(auth.token, text)
        activeConversationId.value = conv.id
        const detail = await getSupportConversationDetail(auth.token, conv.id)
        setMessages(detail.messages)
      } else {
        const sent = await sendSupportMessage(auth.token, activeConversationId.value, text)
        // WebSocket 可能已把这条消息推来，按 id 去重避免重复
        if (!messages.value.some((m) => m.id === sent.id)) {
          messages.value.push({ ...sent, time: formatTime(sent.created_at) })
        }
        await scrollToBottom()
      }
      input.value = ''
    } catch (err) {
      error.value = err instanceof Error ? err.message : '发送消息失败'
    }
  }

  async function syncActiveConversation() {
    if (!auth.token || activeConversationId.value === null) return
    try {
      const detail = await getSupportConversationDetail(auth.token, activeConversationId.value)
      if (activeConversationId.value === detail.conversation.id) {
        setMessages(detail.messages)
      }
    } catch {
      // 忽略，下次重连会再同步
    }
  }

  function connectWs() {
    if (!auth.token) return
    ws = new WebSocket(supportConversationWsUrl(auth.token))
    ws.onopen = () => {
      connected.value = true
      wsReconnectDelayMs = WS_RECONNECT_BASE_MS
      // 连接建立后确保已加载当前会话，客户端才能实时收到客服的新消息
      if (activeConversationId.value === null) {
        void ensureConversation()
      } else {
        void syncActiveConversation()
      }
    }
    ws.onmessage = (ev) => {
      try {
        const detail = JSON.parse(ev.data) as SupportConversationDetail
        // 若客户尚未加载任何会话，先接管后端推来的会话，避免推送被丢弃
        if (activeConversationId.value === null) {
          activeConversationId.value = detail.conversation.id
        }
        if (activeConversationId.value === detail.conversation.id) {
          setMessages(detail.messages)
          // 用户正在查看该会话：有新消息时实时标记已读，客服端才能显示“已读”
          if (opened.value) {
            const lastUserRead = detail.conversation.user_last_read_message_id ?? 0
            const maxId = (detail.messages ?? []).reduce((mx, m) => Math.max(mx, m.id), 0)
            if (maxId > lastUserRead) {
              void getSupportConversationDetail(auth.token, detail.conversation.id).catch(() => {})
            }
          }
        }
      } catch {
        // ignore malformed payload
      }
    }
    ws.onclose = () => {
      connected.value = false
      ws = null
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      reconnectTimer = window.setTimeout(connectWs, wsReconnectDelayMs)
      wsReconnectDelayMs = Math.min(wsReconnectDelayMs * 2, WS_RECONNECT_MAX_MS)
    }
    ws.onerror = () => {
      ws?.close()
    }
  }

  /** 渠道是否开启：被客服端停用时整个浮窗不渲染也不建连。 */
  async function resolveChannelEnabled(): Promise<boolean> {
    try {
      const channels = await listPublicSupportChannels()
      const widgetChannel = channels.find((c) => c.channel_key === 'web_widget')
      channelEnabled.value = widgetChannel ? widgetChannel.enabled : true
    } catch {
      // 渠道接口异常时保持展示，避免误伤线上入口
    }
    return channelEnabled.value
  }

  function dispose() {
    if (reconnectTimer) window.clearTimeout(reconnectTimer)
    ws?.close()
    ws = null
  }

  return {
    auth,
    channelEnabled,
    opened,
    loading,
    messages,
    chatBodyRef,
    setChatBodyRef,
    input,
    error,
    connected,
    toggleOpen,
    send,
    connectWs,
    resolveChannelEnabled,
    dispose,
  }
}
