<script setup lang="ts">
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
import { sanitizeRichHtml } from '@/utils/sanitizeHtml'

/**
 * 「跟 AI 聊着填需求」面板。
 *
 * 用户用自然语言描述需求，AI 逐轮澄清并产出结构化草稿；草稿回填到发布表单后，
 * 仍由用户点原来的「确认发布」走既有建需求链路，本面板不直接建需求。
 * AI 答不了或用户主动要求时转平台客服接手，接手后 AI 不再自动应答。
 */

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'filled', values: RequirementDraftFormValues): void
  (e: 'notify', message: string, type?: 'success' | 'warning' | 'error'): void
}>()

const auth = useAuthStore()

const conversationId = ref<number | null>(null)
const messages = ref<RequirementAgentMessage[]>([])
const draft = ref<RequirementDraft | null>(null)
const conversationStatus = ref<RequirementAgentConversationDetail['conversation']['status']>(
  'ai_active',
)
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

// 开场示例：降低「不知道从哪说起」的门槛，点一下直接填进输入框
const starterExamples = [
  '想做一个企业官网，预算 3000 左右',
  '需要一个微信小程序，能下单和看订单',
  '把现有的后台管理系统的登录页改版',
]

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

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function senderLabel(message: RequirementAgentMessage): string {
  switch (message.sender_role) {
    case 'ai':
      return 'AI 助手'
    case 'agent':
      return message.sender_username ? `${message.sender_username}（客服）` : '平台客服'
    case 'system':
      return '系统提示'
    default:
      return '我'
  }
}

function browserRole(): string {
  return auth.isDev ? 'dev' : 'user'
}

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
    emit('notify', '已通知平台客服接手，客服会在这里继续跟你确认需求', 'success')
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
    emit('filled', requirementDraftToFormValues(currentDraft))
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
</script>

<template>
  <div class="agent-panel">
    <header class="agent-panel__head">
      <div class="agent-panel__title">
        <h4>跟 AI 聊着填需求</h4>
        <p>用自然语言说清要做什么，AI 会逐项问清标题、预算与验收标准</p>
      </div>
      <div class="agent-panel__head-side">
        <span class="agent-panel__status" :class="{ 'is-offline': !connected }">
          {{ connected ? statusLabel : '连接中…' }}
        </span>
        <button class="auth-btn ghost agent-panel__back" type="button" @click="emit('close')">
          返回表单
        </button>
      </div>
    </header>

    <div class="agent-panel__grid">
      <section class="agent-panel__chat" aria-label="AI 需求对话">
        <div ref="chatBodyRef" class="agent-panel__messages">
          <p v-if="initializing" class="agent-panel__hint">正在准备对话…</p>

          <template v-else-if="messages.length === 0">
            <div class="agent-panel__empty">
              <p class="agent-panel__empty-title">一句话描述你要做什么</p>
              <p class="agent-panel__empty-text">
                不用先想好字段格式，像跟人说话一样讲清楚就行，缺什么 AI 会继续问。
              </p>
              <div class="agent-panel__examples">
                <button
                  v-for="example in starterExamples"
                  :key="example"
                  type="button"
                  class="agent-panel__example"
                  @click="useExample(example)"
                >
                  {{ example }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div
              v-for="message in messages"
              :key="message.id"
              class="agent-msg"
              :class="`agent-msg--${message.sender_role}`"
            >
              <div class="agent-msg__meta">
                <span class="agent-msg__sender">{{ senderLabel(message) }}</span>
                <time :datetime="message.created_at">{{ formatTime(message.created_at) }}</time>
              </div>
              <div class="agent-msg__bubble">{{ message.content }}</div>
            </div>
          </template>
        </div>

        <p v-if="error" class="agent-panel__error">{{ error }}</p>

        <div class="agent-panel__composer">
          <textarea
            ref="inputRef"
            v-model="input"
            rows="2"
            maxlength="2000"
            :placeholder="
              aiStopped
                ? '平台客服已接手，可以先看看左侧草稿，或等客服回复'
                : '继续补充你的需求，例如：希望两周内上线'
            "
            :disabled="sending || published"
            @keydown.enter.exact.prevent="send"
          ></textarea>
          <div class="agent-panel__composer-actions">
            <button
              v-if="conversationId !== null && !aiStopped && !published"
              class="auth-btn ghost agent-panel__handoff"
              type="button"
              :disabled="handingOff"
              @click="handoff"
            >
              {{ handingOff ? '转接中…' : '转人工客服' }}
            </button>
            <button
              class="auth-btn solid agent-panel__send"
              type="button"
              :disabled="sending || published || input.trim().length === 0"
              @click="send"
            >
              {{ sending ? 'AI 正在整理…' : '发送' }}
            </button>
          </div>
        </div>
      </section>

      <aside class="agent-panel__draft" aria-label="需求草稿">
        <div class="agent-draft__head">
          <h4>需求草稿</h4>
          <span v-if="draft" class="agent-draft__badge" :class="`is-${draft.status}`">
            {{ draft.status === 'ready' ? '已可填入表单' : draft.status === 'adopted' ? '已填入表单' : '整理中' }}
          </span>
        </div>

        <p v-if="!draft" class="agent-panel__hint">
          对话开始后，这里会实时显示 AI 整理出的需求草稿。
        </p>

        <template v-else>
          <p v-if="published" class="agent-panel__hint">
            该需求已发布{{ draft.published_requirement_id ? `（需求号 ${draft.published_requirement_id}）` : '' }}。
          </p>
          <p v-else-if="missingLabels.length > 0" class="agent-panel__hint">
            还需要确认：{{ missingLabels.join('、') }}
          </p>
          <p v-else class="agent-panel__hint is-ready">五个字段都齐了，可以填入表单。</p>

          <dl class="agent-draft">
            <div class="agent-draft__row" :class="{ 'is-missing': draft.missing_fields.includes('title') }">
              <dt>需求标题</dt>
              <dd>{{ draft.title.trim() || '待补' }}</dd>
            </div>
            <div class="agent-draft__row" :class="{ 'is-missing': draft.missing_fields.includes('budget') }">
              <dt>预算</dt>
              <dd>{{ draft.budget === null ? '待补' : `¥${draft.budget}` }}</dd>
            </div>
            <div
              class="agent-draft__row"
              :class="{ 'is-missing': draft.missing_fields.includes('payment_mode') }"
            >
              <dt>发布方式</dt>
              <dd>{{ draft.payment_mode === 'platform_guarantee' ? '电签担保' : '无电签约定' }}</dd>
            </div>
            <div
              class="agent-draft__row agent-draft__row--rich"
              :class="{ 'is-missing': draft.missing_fields.includes('description') }"
            >
              <dt>需求描述</dt>
              <!-- 后端已净化，前端再过一次 DOMPurify 才渲染 -->
              <dd
                v-if="draft.description_html.trim()"
                class="agent-draft__rich"
                v-html="sanitizeRichHtml(draft.description_html)"
              ></dd>
              <dd v-else class="agent-draft__rich is-empty">待补</dd>
            </div>
            <div
              class="agent-draft__row agent-draft__row--rich"
              :class="{ 'is-missing': draft.missing_fields.includes('acceptance') }"
            >
              <dt>验收标准</dt>
              <dd
                v-if="draft.acceptance_html.trim()"
                class="agent-draft__rich"
                v-html="sanitizeRichHtml(draft.acceptance_html)"
              ></dd>
              <dd v-else class="agent-draft__rich is-empty">待补</dd>
            </div>
          </dl>

          <p v-if="agentUsername" class="agent-draft__editor">当前由客服 {{ agentUsername }} 维护</p>
          <p v-else class="agent-draft__editor">由 AI 助手维护</p>
        </template>

        <div class="agent-draft__actions">
          <button
            class="auth-btn solid agent-draft__fill"
            type="button"
            :disabled="!canFillForm || adopting"
            @click="fillForm"
          >
            {{ adopting ? '填入中…' : '填入表单' }}
          </button>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.agent-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  background: #ffffff;
}

.agent-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex: 0 0 auto;
  padding: 14px 22px 12px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.76);
  background: linear-gradient(180deg, #ffffff 0%, rgba(248, 250, 252, 0.96) 100%);
}

.agent-panel__title h4 {
  margin: 0;
  color: #0f172a;
  font-size: 16px;
  line-height: 1.3;
}

.agent-panel__title p {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.agent-panel__head-side {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.agent-panel__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid rgba(37, 99, 235, 0.24);
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.agent-panel__status.is-offline {
  border-color: rgba(203, 213, 225, 0.9);
  background: #f8fafc;
  color: #64748b;
}

.agent-panel__back {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 800;
}

.agent-panel__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.agent-panel__chat {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid rgba(226, 232, 240, 0.76);
}

.agent-panel__messages {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.5) transparent;
}

.agent-panel__hint {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.agent-panel__hint.is-ready {
  color: #15803d;
}

.agent-panel__empty {
  display: grid;
  gap: 10px;
  padding: 8px 0;
}

.agent-panel__empty-title {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
  font-weight: 800;
}

.agent-panel__empty-text {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.agent-panel__examples {
  display: grid;
  gap: 6px;
}

.agent-panel__example {
  width: 100%;
  padding: 8px 11px;
  border: 1px solid rgba(203, 213, 225, 0.86);
  border-radius: 10px;
  background: rgba(248, 250, 252, 0.78);
  color: #334155;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease, color 160ms ease;
}

.agent-panel__example:hover,
.agent-panel__example:focus-visible {
  border-color: rgba(37, 99, 235, 0.5);
  background: #eff6ff;
  color: #1d4ed8;
  outline: none;
}

.agent-msg {
  display: grid;
  gap: 5px;
  max-width: 100%;
}

.agent-msg__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
  font-size: 11px;
}

.agent-msg__sender {
  font-weight: 800;
  color: #64748b;
}

.agent-msg__bubble {
  padding: 9px 12px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 12px;
  background: #f8fafc;
  color: #1f2937;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-msg--user {
  justify-items: end;
}

.agent-msg--user .agent-msg__bubble {
  border-color: rgba(37, 99, 235, 0.32);
  background: #eff6ff;
}

.agent-msg--system {
  justify-items: center;
}

.agent-msg--system .agent-msg__bubble {
  border-style: dashed;
  background: #fffbeb;
  border-color: rgba(245, 158, 11, 0.4);
  color: #92400e;
  font-size: 12px;
}

.agent-panel__error {
  margin: 0;
  padding: 8px 20px 0;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.5;
}

.agent-panel__composer {
  display: grid;
  gap: 8px;
  flex: 0 0 auto;
  padding: 12px 20px 14px;
  border-top: 1px solid rgba(226, 232, 240, 0.76);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), #ffffff);
}

.agent-panel__composer textarea {
  width: 100%;
  min-height: 62px;
  max-height: 140px;
  padding: 10px 12px;
  border: 1px solid rgba(203, 213, 225, 0.82);
  border-radius: 10px;
  background: #ffffff;
  color: #0f172a;
  font: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

.agent-panel__composer textarea:focus {
  border-color: rgba(37, 99, 235, 0.7);
  outline: none;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}

.agent-panel__composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.agent-panel__composer-actions .auth-btn {
  min-height: 36px;
  padding: 0 16px;
  border-radius: 9px;
  font-size: 13px;
  font-weight: 800;
}

.agent-panel__handoff {
  margin-right: auto;
  color: #334155;
}

.agent-panel__send {
  background: #2563eb;
}

.agent-panel__send:hover:not(:disabled) {
  background: #1d4ed8;
}

.agent-panel__draft {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 14px;
  background: rgba(248, 250, 252, 0.72);
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.5) transparent;
}

.agent-draft__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-draft__head h4 {
  margin: 0;
  color: #0f172a;
  font-size: 14px;
}

.agent-draft__badge {
  padding: 3px 8px;
  border: 1px solid rgba(203, 213, 225, 0.9);
  border-radius: 999px;
  background: #ffffff;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.agent-draft__badge.is-ready {
  border-color: rgba(34, 197, 94, 0.36);
  background: #f0fdf4;
  color: #15803d;
}

.agent-draft__badge.is-adopted {
  border-color: rgba(37, 99, 235, 0.28);
  background: #eff6ff;
  color: #1d4ed8;
}

.agent-draft {
  display: grid;
  gap: 8px;
  margin: 0;
}

.agent-draft__row {
  display: grid;
  gap: 4px;
  padding: 9px 11px;
  border: 1px solid rgba(226, 232, 240, 0.9);
  border-radius: 10px;
  background: #ffffff;
}

.agent-draft__row.is-missing {
  border-style: dashed;
  border-color: rgba(245, 158, 11, 0.5);
  background: #fffbeb;
}

.agent-draft__row dt {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.agent-draft__row dd {
  margin: 0;
  color: #0f172a;
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
}

.agent-draft__row dd.is-empty {
  color: #b45309;
}

.agent-draft__rich {
  max-height: 180px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.65;
}

.agent-draft__rich :deep(p) {
  margin: 0 0 6px;
}

.agent-draft__rich :deep(p:last-child) {
  margin-bottom: 0;
}

.agent-draft__rich :deep(img),
.agent-draft__rich :deep(video) {
  max-width: 100%;
  height: auto;
}

.agent-draft__editor {
  margin: 0;
  color: #94a3b8;
  font-size: 11px;
}

.agent-draft__actions {
  margin-top: auto;
  padding-top: 4px;
}

.agent-draft__actions .auth-btn {
  width: 100%;
  min-height: 40px;
  border-radius: 10px;
  font-weight: 800;
}

.agent-draft__fill {
  background: #2563eb;
  box-shadow: 0 12px 24px rgba(37, 99, 235, 0.2);
}

.agent-draft__fill:hover:not(:disabled) {
  background: #1d4ed8;
}

@media (max-width: 900px) {
  .agent-panel__grid {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .agent-panel__chat {
    border-right: 0;
    border-bottom: 1px solid rgba(226, 232, 240, 0.76);
  }

  .agent-panel__draft {
    max-height: 46vh;
  }
}

@media (max-width: 640px) {
  .agent-panel__head {
    flex-direction: column;
    align-items: stretch;
    padding: 12px 16px 10px;
  }

  .agent-panel__head-side {
    justify-content: space-between;
  }

  .agent-panel__messages {
    padding: 12px 16px;
  }

  .agent-panel__composer {
    padding: 10px 16px 12px;
  }

  .agent-panel__draft {
    padding: 12px 16px;
  }
}
</style>
