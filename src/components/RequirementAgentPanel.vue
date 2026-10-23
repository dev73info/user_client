<script setup lang="ts">
import RequirementAgentDraft from '@/components/requirement/RequirementAgentDraft.vue'
import { useRequirementAgentChat } from '@/composables/useRequirementAgentChat'
import type { RequirementDraftFormValues } from '@/shared/requirementDraft'
import {
  AGENT_STARTER_EXAMPLES,
  agentSenderLabel,
  formatAgentTime,
} from '@/shared/requirementAgentDisplay'

/**
 * 「跟 AI 聊着填需求」面板。
 *
 * 用户用自然语言描述需求，AI 逐轮澄清并产出结构化草稿；草稿回填到发布表单后，
 * 仍由用户点原来的「确认发布」走既有建需求链路，本面板不直接建需求。
 * AI 答不了或用户主动要求时转平台客服接手，接手后 AI 不再自动应答。
 *
 * 拆分（R047）：会话状态、发消息 / 转人工 / 采纳草稿与 WebSocket 在 `useRequirementAgentChat`；
 * 发送者文案与开场示例在 `shared/requirementAgentDisplay.ts`；
 * 右侧草稿栏在 `components/requirement/RequirementAgentDraft.vue`。
 * 本组件是左侧对话区本身（DOM 引用要在这一层，滚动与聚焦都在 composable 里用它们）。
 */

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'filled', values: RequirementDraftFormValues): void
  (e: 'notify', message: string, type?: 'success' | 'warning' | 'error'): void
}>()

const {
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
} = useRequirementAgentChat({
  notify: (message, type) => {
    emit('notify', message, type)
  },
  onDraftAdopted: (values) => {
    emit('filled', values)
  },
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
                  v-for="example in AGENT_STARTER_EXAMPLES"
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
                <span class="agent-msg__sender">{{ agentSenderLabel(message) }}</span>
                <time :datetime="message.created_at">{{
                  formatAgentTime(message.created_at)
                }}</time>
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

      <RequirementAgentDraft
        :draft="draft"
        :published="published"
        :missing-labels="missingLabels"
        :agent-username="agentUsername"
        :can-fill-form="canFillForm"
        :adopting="adopting"
        @fill="fillForm"
      />
    </div>
  </div>
</template>

<style scoped src="./requirement-agent-chat.css"></style>

<style scoped src="./requirement-agent-draft.css"></style>
