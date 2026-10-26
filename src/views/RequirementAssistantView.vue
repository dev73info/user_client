<script setup lang="ts">
import { useRequirementAssistant } from '@/composables/useRequirementAssistant'
import {
  AGENT_STARTER_EXAMPLES,
  agentSenderLabel,
  formatAgentTime,
} from '@/shared/requirementAssistant'
import { TButton } from 'ui_73info'

const {
  conversations,
  detail,
  draft,
  input,
  loading,
  sending,
  handingOff,
  adopting,
  error,
  messagesRef,
  conversation,
  aiStopped,
  published,
  missingLabels,
  statusLabel,
  loadConversations,
  startNewConversation,
  send,
  selectConversation,
  handoff,
  adopt,
} = useRequirementAssistant()
</script>

<template>
  <main class="page-shell custom-page-shell profile-page assistant-page">
    <section class="wb-strip" aria-label="需求助手概览">
      <div class="wb-strip__item">
        <span>历史会话</span><strong>{{ conversations.length }}</strong>
      </div>
      <div class="wb-strip__item">
        <span>当前状态</span><strong>{{ statusLabel }}</strong>
      </div>
      <div class="wb-strip__item wb-strip__action">
        <TButton variant="outline" @click="startNewConversation">新对话</TButton>
      </div>
    </section>

    <div v-if="error" class="wb-empty" role="alert">
      <span>{{ error }}</span>
      <TButton variant="outline" @click="loadConversations">重试</TButton>
    </div>

    <section class="assistant-grid">
      <aside class="wallet-section assistant-history">
        <h3>历史会话</h3>
        <p v-if="loading" class="wb-empty" role="status">正在加载…</p>
        <p v-else-if="!conversations.length" class="wb-empty">还没有历史会话</p>
        <ul v-else>
          <li v-for="item in conversations" :key="item.id">
            <button
              type="button"
              :class="{ active: conversation?.id === item.id }"
              @click="selectConversation(item)"
            >
              <strong>{{ item.last_message || item.conversation_no }}</strong>
              <span>{{ formatAgentTime(item.updated_at) }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <section class="wallet-section assistant-chat">
        <header class="assistant-head">
          <div>
            <h3>{{ conversation ? conversation.conversation_no : '新需求对话' }}</h3>
            <p>{{ conversation ? statusLabel : '描述你的需求，AI 会逐项澄清' }}</p>
          </div>
          <TButton
            v-if="conversation && !aiStopped && !published"
            variant="outline"
            :loading="handingOff"
            @click="handoff"
          >
            转人工客服
          </TButton>
        </header>

        <div ref="messagesRef" class="assistant-messages">
          <p v-if="!detail?.messages.length" class="wb-empty">
            一句话描述要做什么。例如：{{ AGENT_STARTER_EXAMPLES[0] }}
          </p>
          <article
            v-for="message in detail?.messages ?? []"
            :key="message.id"
            :class="`assistant-message assistant-message--${message.sender_role}`"
          >
            <header>
              <strong>{{ agentSenderLabel(message) }}</strong>
              <time>{{ formatAgentTime(message.created_at) }}</time>
            </header>
            <p>{{ message.content }}</p>
          </article>
        </div>

        <div class="assistant-compose">
          <textarea
            v-model="input"
            rows="3"
            :disabled="sending || published || aiStopped"
            :placeholder="aiStopped ? '客服已接手，请等待回复' : '继续补充需求…'"
            @keydown.enter.exact.prevent="send"
          />
          <div class="assistant-actions">
            <button
              v-for="example in !conversation ? AGENT_STARTER_EXAMPLES : []"
              :key="example"
              type="button"
              class="assistant-example"
              @click="input = example"
            >
              {{ example }}
            </button>
            <TButton
              variant="solid"
              tone="accent"
              :loading="sending"
              :disabled="!input.trim() || aiStopped || published"
              @click="send"
            >
              {{ sending ? 'AI 正在整理…' : '发送' }}
            </TButton>
          </div>
        </div>
      </section>

      <aside class="wallet-section assistant-draft">
        <h3>需求草稿</h3>
        <p v-if="!draft" class="wb-empty">开始对话后显示结构化草稿</p>
        <template v-else>
          <p v-if="draft.published_requirement_id" class="assistant-note">
            已发布为 {{ draft.published_requirement_id }}
          </p>
          <p v-else-if="missingLabels.length" class="assistant-note">
            待补：{{ missingLabels.join('、') }}
          </p>
          <dl>
            <div>
              <dt>标题</dt>
              <dd>{{ draft.title || '待补' }}</dd>
            </div>
            <div>
              <dt>预算</dt>
              <dd>{{ draft.budget_fen == null ? '待补' : `¥${draft.budget_fen / 100}` }}</dd>
            </div>
            <div>
              <dt>发布方式</dt>
              <dd>{{ draft.payment_mode === 'platform_guarantee' ? '电签担保' : '无电签约定' }}</dd>
            </div>
            <div>
              <dt>开发周期</dt>
              <dd>
                {{
                  draft.development_cycle_days == null
                    ? '待补'
                    : `${draft.development_cycle_days} 天`
                }}
              </dd>
            </div>
          </dl>
          <TButton
            variant="solid"
            tone="accent"
            :loading="adopting"
            :disabled="published || !draft.title.trim()"
            @click="adopt"
          >
            采纳并填入发布表单
          </TButton>
        </template>
      </aside>
    </section>
  </main>
</template>

<style scoped src="@/styles/requirement-assistant.css"></style>
