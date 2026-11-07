import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  createRequirementAgentConversation,
  requirementAgentConversationWsUrl,
  requestRequirementAgentHandoff,
  sendRequirementAgentMessage,
  type RequirementAgentConversationDetail,
  type RequirementAgentMessage,
  type RequirementDraft,
} from '@/api/requirementAgent'
import {
  draftToPublishForm,
  requirementDraftFieldLabel,
  requirementDraftHasContent,
  type RequirementAssistantFormValues,
} from '@/shared/requirementAssistant'
import { useAuthStore } from '@/stores/auth'

export type RequirementAgentChatOptions = {
  /** 面板自己弹提示（转人工成功那条）。 */
  notify: (message: string, type: 'success' | 'warning' | 'error') => void
  /**
   * 每轮草稿更新后自动回填发布表单。
   *
   * 面板不直接建需求：回填后仍由用户点原来的「确认发布」走既有建需求链路。
   * 具体哪些字段真的写进了表单（例如电签担保未开放时会被跳过）由调用方统计并展示。
   */
  onDraftUpdate: (values: RequirementAssistantFormValues) => void
}

/**
 * 「AI 需求分析」面板的会话层。
 *
 * 用户用自然语言描述需求，AI 逐轮澄清并产出结构化草稿；每轮草稿变化都会自动回填到
 * 发布表单（标题 / 描述 / 验收标准 / 预算 / 担保方式 / 开发周期），用户仍可手动调整。
 * AI 答不了或用户主动要求时转平台客服接手，接手后 AI 不再自动应答。
 *
 * 时序：面板打开时新建会话（不接旧会话，避免把上一次需求的内容覆盖到当前表单）；
 * 连上 WebSocket 后以推送为准，断线按 3s 起、翻倍到 15s 退避重连；
 * 卸载时清重连定时器并关连接。
 */
export function useRequirementAgentChat(options: RequirementAgentChatOptions) {
  const auth = useAuthStore()

  const conversationId = ref<number | null>(null)
  const messages = ref<RequirementAgentMessage[]>([])
  const draft = ref<RequirementDraft | null>(null)
  const conversationStatus =
    ref<RequirementAgentConversationDetail['conversation']['status']>('ai_active')
  const agentUsername = ref<string | null>(null)

  const input = ref('')
  const sending = ref(false)
  const handingOff = ref(false)
  const error = ref('')
  const connected = ref(false)

  const chatBodyRef = ref<HTMLElement | null>(null)
  const inputRef = ref<HTMLTextAreaElement | null>(null)

  let ws: WebSocket | null = null
  let reconnectTimer: number | null = null
  // 重连退避：后端不可用时逐次翻倍，连上后重置
  const WS_RECONNECT_BASE_MS = 3000
  const WS_RECONNECT_MAX_MS = 15_000
  let wsReconnectDelayMs = WS_RECONNECT_BASE_MS

  // 同一版草稿只回填一次：后端推送与接口返回会重复送达同一份 detail
  let lastAppliedSignature = ''
  let lastAppliedDraft: RequirementDraft | null = null

  const needsLogin = computed(() => !auth.token)
  const statusLabel = computed(() => {
    switch (conversationStatus.value) {
      case 'agent_takeover':
        return '平台客服已接手'
      case 'published':
        return '需求已发布'
      case 'closed':
        return '会话已结束'
      default:
        return 'AI 梳理中'
    }
  })

  const aiStopped = computed(
    () => conversationStatus.value === 'agent_takeover' || conversationStatus.value === 'closed',
  )
  const published = computed(() => conversationStatus.value === 'published')
  const missingLabels = computed(() =>
    (draft.value?.missing_fields ?? [])
      .map((key) => requirementDraftFieldLabel(key))
      .filter((label) => label.length > 0),
  )
  const canSend = computed(
    () =>
      !needsLogin.value &&
      !sending.value &&
      !aiStopped.value &&
      !published.value &&
      input.value.trim().length > 0,
  )

  async function scrollToBottom() {
    await nextTick()
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  }

  /** 草稿有变化时回填表单；空草稿与同一版草稿不重复回填。 */
  function syncDraft(next: RequirementDraft | null) {
    if (next == null || !requirementDraftHasContent(next)) {
      return
    }

    const signature = `${next.id}:${next.updated_at}:${next.status}`
    if (signature === lastAppliedSignature) {
      return
    }

    lastAppliedSignature = signature
    lastAppliedDraft = next
    options.onDraftUpdate(draftToPublishForm(next))
  }

  function applyDetail(detail: RequirementAgentConversationDetail) {
    conversationId.value = detail.conversation.id
    conversationStatus.value = detail.conversation.status
    agentUsername.value = detail.conversation.agent_username ?? null
    messages.value = detail.messages ?? []
    draft.value = detail.draft ?? null
    syncDraft(draft.value)
    void scrollToBottom()
  }

  /** 建会话时要带视角：开发者与需求方各走各的话术。 */
  function browserRole(): string {
    return auth.isDev ? 'dev' : 'user'
  }

  async function send() {
    const content = input.value.trim()
    if (!content || sending.value || aiStopped.value) {
      return
    }
    if (!auth.token) {
      error.value = '请先登录后使用 AI 需求分析'
      return
    }

    sending.value = true
    error.value = ''

    try {
      const detail =
        conversationId.value === null
          ? await createRequirementAgentConversation(auth.token, content, browserRole())
          : await sendRequirementAgentMessage(auth.token, conversationId.value, content)
      applyDetail(detail)
      input.value = ''
      await nextTick()
      inputRef.value?.focus()
    } catch (err) {
      error.value = err instanceof Error ? err.message : '发送消息失败'
    } finally {
      sending.value = false
    }
  }

  async function handoff() {
    if (conversationId.value === null || handingOff.value || !auth.token) {
      return
    }

    handingOff.value = true
    error.value = ''
    try {
      const detail = await requestRequirementAgentHandoff(auth.token, conversationId.value)
      applyDetail(detail)
      options.notify('已通知平台客服接手，客服会在这里继续跟你确认需求', 'success')
    } catch (err) {
      error.value = err instanceof Error ? err.message : '转人工客服失败'
    } finally {
      handingOff.value = false
    }
  }

  function useExample(example: string) {
    input.value = example
    void nextTick(() => inputRef.value?.focus())
  }

  function connectWs() {
    if (!auth.token) {
      return
    }

    ws = new WebSocket(requirementAgentConversationWsUrl(auth.token))
    ws.onopen = () => {
      connected.value = true
      wsReconnectDelayMs = WS_RECONNECT_BASE_MS
    }
    ws.onmessage = (event) => {
      try {
        const detail = JSON.parse(String(event.data)) as RequirementAgentConversationDetail
        const id = detail?.conversation?.id
        if (typeof id !== 'number') {
          return
        }

        // 本端还没绑会话时接住后端推来的会话，避免推送被丢弃
        if (conversationId.value === null) {
          conversationId.value = id
        }

        if (conversationId.value === id) {
          applyDetail(detail)
        }
      } catch {
        // 忽略无法解析的推送
      }
    }
    ws.onclose = () => {
      connected.value = false
      ws = null
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer)
      }
      reconnectTimer = window.setTimeout(connectWs, wsReconnectDelayMs)
      wsReconnectDelayMs = Math.min(wsReconnectDelayMs * 2, WS_RECONNECT_MAX_MS)
    }
    ws.onerror = () => {
      ws?.close()
    }
  }

  onMounted(() => {
    connectWs()
    void nextTick(() => inputRef.value?.focus())
  })

  onBeforeUnmount(() => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
    }
    ws?.close()
    ws = null
  })

  return {
    conversationId,
    messages,
    draft,
    agentUsername,
    input,
    sending,
    handingOff,
    error,
    connected,
    chatBodyRef,
    inputRef,
    needsLogin,
    statusLabel,
    aiStopped,
    published,
    missingLabels,
    canSend,
    send,
    handoff,
    useExample,
  }
}
