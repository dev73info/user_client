/**
 * AI 需求助手（`/api/requirement-agent/**`）的假路由。
 *
 * 这一族原本一条都没实现，`GET /requirement-agent/conversations/mine` 落到兜底的 `[]`：
 * 助手页的「历史会话」永远是空，「新对话」发出去也没有下文——整页只是一个不动的输入框。
 *
 * 假数据里做一条完整的往返：用户发一句，助手回一段并顺手产出草稿，
 * 于是「转人工」与「采纳草稿」这两个按钮点得到、状态也看得见变化。
 * 助手回复是**固定文案**，不接任何模型：它模拟的是交互，不是能力。
 */

import type { components } from '@/api/generated/schema'

import type { MockRoute } from '../../router'
import { DEV_USERNAME, datetime } from '../../db/shared'
import { errorResponse, jsonResponse } from '../../response'

type AgentConversation = components['schemas']['AgentConversationResponse']
type AgentMessage = components['schemas']['AgentMessageResponse']
type AgentDraft = components['schemas']['AgentDraftResponse']
type AgentDetail = components['schemas']['AgentConversationDetailResponse']

const AGENT_USERNAME = 'requirement_agent'

/**
 * 助手每轮固定回一句「还差什么」，措辞与草稿的 `missing_fields` 一致。
 *
 * `missing_fields` 只放得下前端 `DRAFT_LABELS`（title / description / budget / acceptance /
 * payment_mode）认得的键：别的键会被过滤掉，界面上就少显示一项，看着像草稿没整理完。
 */
const AGENT_REPLY = '已记录。还需要：验收标准、预算范围。补齐后我可以直接生成需求草稿。'

type ConversationState = {
  conversation: AgentConversation
  messages: AgentMessage[]
  draft: AgentDraft | null
}

let nextConversationId = 1
let nextMessageId = 1
let nextDraftId = 1

const conversations: ConversationState[] = []

function nowText(): string {
  return datetime(0, new Date().getHours(), new Date().getMinutes())
}

function pushMessage(
  state: ConversationState,
  senderRole: 'user' | 'agent',
  content: string,
): AgentMessage {
  const message: AgentMessage = {
    id: nextMessageId,
    conversation_id: state.conversation.id,
    sender_username: senderRole === 'user' ? DEV_USERNAME : AGENT_USERNAME,
    sender_role: senderRole,
    content,
    created_at: nowText(),
  }
  nextMessageId += 1
  state.messages.push(message)
  state.conversation.last_message = content
  state.conversation.last_message_at = message.created_at
  state.conversation.last_message_by = senderRole
  state.conversation.updated_at = message.created_at
  if (senderRole === 'agent') {
    state.conversation.ai_turns += 1
  }

  return message
}

/** 每轮之后重算草稿：缺哪几项写清楚，界面据此显示「还差 N 项」。 */
function refreshDraft(state: ConversationState): void {
  state.draft = {
    id: state.draft?.id ?? nextDraftId,
    conversation_id: state.conversation.id,
    owner_username: DEV_USERNAME,
    title: '需求草稿（AI 整理）',
    description_html: '<p>待补全：业务背景、交付时间、验收标准。</p>',
    acceptance_html: '<p>待补全：可量化的验收标准。</p>',
    payment_mode: 'platform_guarantee',
    budget_fen: null,
    development_cycle_days: null,
    missing_fields: ['acceptance', 'budget'],
    status: 'draft',
    source: 'agent',
    last_editor: AGENT_USERNAME,
    published_requirement_id: null,
    created_at: state.draft?.created_at ?? nowText(),
    updated_at: nowText(),
  }
  if (!state.draft.id) {
    nextDraftId += 1
  }
  state.conversation.draft_id = state.draft.id
  state.conversation.draft_ready = true
}

function detailOf(state: ConversationState): AgentDetail {
  return {
    conversation: state.conversation,
    messages: state.messages,
    draft: state.draft,
  }
}

export const agentRoutes: MockRoute[] = [
  {
    method: 'GET',
    path: '/requirement-agent/conversations/mine',
    note: '我的需求助手会话（契约是裸数组）',
    handler: () => jsonResponse(conversations.map((item) => item.conversation)),
  },
  {
    method: 'POST',
    path: '/requirement-agent/conversations',
    note: '发起一次需求梳理：落一条会话 + 助手的第一句回复',
    handler: (request) => {
      const body = (request.body ?? {}) as { content?: string; user_role?: string }
      const content = (body.content ?? '').trim()
      if (!content) {
        return errorResponse(400, '请输入需求描述')
      }

      const id = nextConversationId
      nextConversationId += 1

      const state: ConversationState = {
        conversation: {
          id,
          conversation_no: `AGENT-${String(id).padStart(4, '0')}`,
          user_username: DEV_USERNAME,
          user_role: body.user_role === 'dev' ? 'dev' : 'user',
          status: 'ai_active',
          agent_username: AGENT_USERNAME,
          unread_agent: 0,
          unread_user: 0,
          draft_ready: false,
          draft_id: null,
          ai_turns: 0,
          last_message: null,
          last_message_at: null,
          last_message_by: null,
          created_at: nowText(),
          updated_at: nowText(),
        },
        messages: [],
        draft: null,
      }

      pushMessage(state, 'user', content)
      pushMessage(state, 'agent', AGENT_REPLY)
      refreshDraft(state)
      conversations.unshift(state)

      return jsonResponse(detailOf(state), 201)
    },
  },
  {
    method: 'GET',
    path: '/requirement-agent/conversations/:id',
    note: '会话详情：会话 + 消息 + 草稿',
    handler: (_request, params) => {
      const state = conversations.find((item) => String(item.conversation.id) === params.id)

      return state ? jsonResponse(detailOf(state)) : errorResponse(404, '会话不存在')
    },
  },
  {
    method: 'POST',
    path: '/requirement-agent/conversations/:id/messages',
    note: '继续对话：追加用户消息并回一句助手消息',
    handler: (request, params) => {
      const state = conversations.find((item) => String(item.conversation.id) === params.id)
      if (!state) {
        return errorResponse(404, '会话不存在')
      }
      const content = ((request.body as { content?: string } | null)?.content ?? '').trim()
      if (!content) {
        return errorResponse(400, '请输入内容')
      }

      pushMessage(state, 'user', content)
      pushMessage(state, 'agent', AGENT_REPLY)
      refreshDraft(state)

      return jsonResponse(detailOf(state))
    },
  },
  {
    method: 'POST',
    path: '/requirement-agent/conversations/:id/handoff',
    note: '转人工：状态置 agent_takeover，助手不再自动回复',
    handler: (_request, params) => {
      const state = conversations.find((item) => String(item.conversation.id) === params.id)
      if (!state) {
        return errorResponse(404, '会话不存在')
      }

      state.conversation.status = 'agent_takeover'
      state.conversation.updated_at = nowText()

      return jsonResponse(detailOf(state))
    },
  },
  {
    method: 'POST',
    path: '/requirement-agent/drafts/:draftId/adopt',
    note: '采纳草稿：回草稿本身，前端据此填发布表单',
    handler: (_request, params) => {
      const state = conversations.find(
        (item) => String(item.draft?.id ?? '') === (params.draftId ?? ''),
      )
      if (!state?.draft) {
        return errorResponse(404, '草稿不存在')
      }

      state.draft.status = 'adopted'
      state.draft.updated_at = nowText()

      return jsonResponse(state.draft)
    },
  },
]
