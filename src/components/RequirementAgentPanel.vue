<script setup lang="ts">
import { TIcon, MagicStick } from 'ui_73info'

import { useRequirementAgentChat } from '@/composables/useRequirementAgentChat'
import {
  AGENT_STARTER_EXAMPLES,
  agentSenderLabel,
  formatAgentTime,
  type RequirementAssistantFormValues,
} from '@/shared/requirementAssistant'

/**
 * 「AI 需求分析」面板。
 *
 * 用户用自然语言描述需求，AI 逐轮澄清并产出结构化草稿；草稿每轮自动回填到发布表单
 * （标题 / 描述 / 验收标准 / 预算 / 担保方式 / 开发周期），用户仍可手动调整。
 * 本面板不直接建需求：回填后仍由用户点原来的「确认发布」走既有建需求链路。
 *
 * 布局由 `PublishModal` 决定：PC 端是右侧分栏，移动端是整屏对话页；
 * 移动端的「查看需求」按钮由本组件抛出，表单以侧滑抽屉显示，不影响对话状态。
 */
defineProps<{
  /** 最近一次真的写进表单的字段（由 `PublishModal` 统计，担保未开放时不会误报）。 */
  appliedLabels: string[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'view-form'): void
  (e: 'draft-update', values: RequirementAssistantFormValues): void
  (e: 'notify', message: string, type?: 'success' | 'warning' | 'error'): void
}>()

const {
  conversationId,
  messages,
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
} = useRequirementAgentChat({
  notify: (message, type) => emit('notify', message, type),
  onDraftUpdate: (values) => emit('draft-update', values),
})
</script>

<template>
  <div class="agent-panel" aria-label="AI 需求分析">
    <header class="agent-panel__head">
      <div class="agent-panel__title">
        <span class="agent-panel__badge">
          <TIcon><MagicStick /></TIcon>
        </span>
        <div class="agent-panel__title-text">
          <h4>AI 需求分析</h4>
          <p>{{ needsLogin ? '未登录' : connected ? statusLabel : '连接中…' }}</p>
        </div>
      </div>
      <div class="agent-panel__head-actions">
        <button class="agent-panel__action is-mobile-only" type="button" @click="emit('view-form')">
          查看需求
        </button>
        <button class="agent-panel__action" type="button" @click="emit('close')">收起</button>
      </div>
    </header>

    <p v-if="appliedLabels.length > 0" class="agent-panel__applied">
      已自动填入：{{ appliedLabels.join('、') }}
    </p>
    <p v-if="missingLabels.length > 0" class="agent-panel__missing">
      还差：{{ missingLabels.join('、') }}
    </p>

    <div ref="chatBodyRef" class="agent-panel__messages">
      <div v-if="messages.length === 0" class="agent-panel__empty">
        <p class="agent-panel__empty-title">说说你要做什么</p>
        <p class="agent-panel__empty-text">
          像跟人说话一样讲清楚就行，缺什么 AI 会继续问，整理好的内容会实时填进左侧表单。
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

      <div
        v-for="message in messages"
        :key="message.id"
        class="agent-msg"
        :class="`agent-msg--${message.sender_role}`"
      >
        <div class="agent-msg__meta">
          <span class="agent-msg__sender">{{ agentSenderLabel(message) }}</span>
          <time :datetime="message.created_at">{{ formatAgentTime(message.created_at) }}</time>
        </div>
        <div class="agent-msg__bubble">{{ message.content }}</div>
      </div>
    </div>

    <p v-if="needsLogin" class="agent-panel__error">请先登录后使用 AI 需求分析</p>
    <p v-else-if="error" class="agent-panel__error">{{ error }}</p>

    <div class="agent-panel__composer">
      <textarea
        ref="inputRef"
        v-model="input"
        rows="2"
        maxlength="2000"
        :placeholder="
          aiStopped
            ? '平台客服已接手，可以先看看需求内容，或等客服回复'
            : '继续补充你的需求，例如：希望两周内上线'
        "
        :disabled="sending || published"
        @keydown.enter.exact.prevent="send"
      ></textarea>
      <div class="agent-panel__composer-actions">
        <button
          v-if="conversationId !== null && !aiStopped && !published"
          class="agent-panel__handoff"
          type="button"
          :disabled="handingOff"
          @click="handoff"
        >
          {{ handingOff ? '转接中…' : '转人工客服' }}
        </button>
        <button class="agent-panel__send" type="button" :disabled="!canSend" @click="send">
          {{ sending ? 'AI 正在整理…' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./requirement-agent-panel.css"></style>

<style scoped src="./requirement-agent-chat.css"></style>
