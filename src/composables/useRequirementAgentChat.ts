import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

import {
  adoptRequirementDraft,
  createRequirementAgentConversation,
  getRequirementAgentConversation,
  listMyRequirementAgentConversations,
  requestRequirementAgentHandoff,
  requirementAgentConversationWsUrl,
  sendRequirementAgentMessage,
  type RequirementAgentConversationDetail,
  type RequirementAgentMessage,
  type RequirementDraft,
} from '@/api/requirementAgent'
import {
  requirementDraftFieldLabel,
  requirementDraftHasContent,
  requirementDraftToFormValues,
  type RequirementDraftFormValues,
} from '@/shared/requirementDraft'
import { useAuthStore } from '@/stores/auth'

export type RequirementAgentChatOptions = {
  /** 面板自己弹提示（转人工成功那条）。 */
  notify: (message: string, type: 'success' | 'warning' | 'error') => void
  /** 草稿采纳：把表单字段交回调用方（面板不直接建需求）。 */
  onDraftAdopted: (values: RequirementDraftFormValues) => void
}

/**
 * 「跟 AI 聊着填需求」面板的会话层（R047 从 `components/RequirementAgentPanel.vue` 拆出）。
 *
 * 用户用自然语言描述需求，AI 逐轮澄清并产出结构化草稿；草稿回填到发布表单后，
 * 仍由用户点原来的「确认发布」走既有建需求链路，本面板不直接建需求。
 * AI 答不了或用户主动要求时转平台客服接手，接手后 AI 不再自动应答。
 *
 * 时序与拆出前一致：挂载先接回最近一条「AI 梳理中」的会话再连 WebSocket；
 * 连上后补一次拉取（避免断线期间错过的回复看不到）；断线按 3s 起、翻倍到 15s 退避重连；
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
  const initializing = ref(true)
  const sending = ref(false)
  const handingOff = ref(false)
  const adopting = ref(false)
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
  const canFillForm = computed(() => !published.value && requirementDraftHasContent(draft.value))
  const missingLabels = computed(() =>
    (draft.value?.missing_fields ?? [])
      .map((key) => requirementDraftFieldLabel(key))
      .filter((label) => label.length > 0),
  )

  async function scrollToBottom() {
    await nextTick()
    if (chatBodyRef.value) {
      chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
    }
  }

  function applyDetail(detail: RequirementAgentConversationDetail) {
    conversationId.value = detail.conversation.id
    conversationStatus.value = detail.conversation.status
    agentUsername.value = detail.conversation.agent_username
    messages.value = detail.messages ?? []
    draft.value = detail.draft ?? null
    void scrollToBottom()
  }

  /** 载入最近一条「AI 梳理中」的会话，接着上次聊，避免每次进来都从零开始 */
  async function loadExistingConversation() {
    if (!auth.token) {
      initializing.value = false
      return
    }

    try {
      const list = await listMyRequirementAgentConversations(auth.token)
      // 只接回 AI 仍在应答的会话。已转人工 / 已结束 / 已发布的会话不再自动挂回：
      // 那几种状态下输入框是禁用的，若自动挂回，用户既问不了 AI，也起不了新会话。
      const current = list.find((item) => item.status === 'ai_active') ?? null
      if (!current) {
        return
      }

      const detail = await getRequirementAgentConversation(auth.token, current.id)
      applyDetail(detail)
    } catch (err) {
      error.value = err instanceof Error ? err.message : '加载 AI 需求会话失败'
    } finally {
      initializing.value = false
    }
  }

  /** 建会话时要带视角：开发者与需求方各走各的话术。 */
  function browserRole(): string {
    return auth.isDev ? 'dev' : 'user'
  }

  async function send() {
    const content = input.value.trim()
    if (!content || sending.value || !auth.token) {
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

  async function fillForm() {
    const currentDraft = draft.value
    if (!currentDraft || adopting.value || !auth.token) {
      return
    }

    adopting.value = true
    error.value = ''
    try {
      // 采纳只做记录，需求仍由用户在表单里点「确认发布」创建
      await adoptRequirementDraft(auth.token, currentDraft.id)
      options.onDraftAdopted(requirementDraftToFormValues(currentDraft))
    } catch (err) {
      error.value = err instanceof Error ? err.message : '采纳需求草稿失败'
    } finally {
      adopting.value = false
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
      // 连接建立后补一次同步，避免断线期间错过的 AI 回复看不到
      if (conversationId.value !== null) {
        void getRequirementAgentConversation(auth.token, conversationId.value)
          .then((detail) => {
            if (conversationId.value === detail.conversation.id) {
              applyDetail(detail)
            }
          })
          .catch(() => {})
      }
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

  onMounted(async () => {
    await loadExistingConversation()
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
    initializing,
    sending,
    handingOff,
    adopting,
    error,
    connected,
    chatBodyRef,
    inputRef,
    statusLabel,
    aiStopped,
    published,
    canFillForm,
    missingLabels,
    send,
    handoff,
    fillForm,
    useExample,
  }
}
