/**
 * 需求沟通会话：会话列表、按需求取会话、发消息，以及 `/conversations/events` 实时流。
 *
 * 实时流用 fetch 读流（见 `src/shared/api/sse.ts`），所以可以在 mock 里手写：
 * 连接后先推一条当前会话快照，之后只发注释行当心跳，保持连接不空转，
 * 页面上的「已连接」状态与断线重连逻辑都能看到真实表现。
 * 对方不会真的回消息——mock 没有第二个在线用户。
 */

import type { RequirementConversation, RequirementConversationDetail } from '@/shared/conversations'

import { DEV_USERNAME, findRequirement, requirements } from '../db'
import { defineRouteTable, type MockRequest, type MockRoute } from '../router'
import { jsonResponse, textResponse } from '../response'

const SSE_HEARTBEAT_MS = 20_000

function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function conversationIdOf(requirementCode: string): string {
  return `CONV-${requirementCode}`
}

/** 有开发者的需求才有会话；客户看到自己全部有开发者的单，开发者看自己的接单。 */
function visibleRequirements(request: MockRequest) {
  return requirements.filter((item) => {
    if (!item.developer) {
      return false
    }
    return request.identity === 'dev' ? item.developer === DEV_USERNAME : true
  })
}

function buildConversation(request: MockRequest, code: string): RequirementConversation | null {
  const requirement = findRequirement(code)
  if (!requirement || !requirement.developer) {
    return null
  }

  const messages = messagesOf(code)

  return {
    id: requirement.id,
    conversation_id: conversationIdOf(code),
    requirement_id: code,
    requirement_title: requirement.title,
    customer: requirement.creator ?? '',
    customer_avatar_url: null,
    developer: requirement.developer,
    status: requirement.status === 'completed' || requirement.status === 'cancelled' ? 'closed' : 'open',
    requirement_status: requirement.status,
    last_message_at: messages[messages.length - 1]?.created_at ?? requirement.updated_at,
    last_message_by: messages[messages.length - 1]?.sender ?? null,
    last_message_content: messages[messages.length - 1]?.content ?? null,
    last_message_attachment_url: null,
    last_message_attachment_mime: null,
    created_at: requirement.created_time ?? requirement.updated_at,
    updated_at: requirement.updated_at,
    history_segments: [],
    history_disclosures: [],
  }
}

/* ------------------------------------------------------------------ 消息存储 */

type MockMessage = {
  id: number
  conversation_id: string
  sender: string
  sender_role: 'customer' | 'developer' | 'platform'
  content: string
  attachment_url?: string | null
  attachment_name?: string | null
  attachment_mime?: string | null
  attachment_size?: number | null
  message_type?: string | null
  action_type?: string | null
  action_ref?: string | null
  created_at: string
}

const messageStore = new Map<string, MockMessage[]>()
let nextMessageId = 1

function seedMessages(code: string): MockMessage[] {
  const requirement = findRequirement(code)
  if (!requirement) {
    return []
  }

  const conversationId = conversationIdOf(code)
  const customer = requirement.creator ?? ''

  return [
    {
      id: nextMessageId++,
      conversation_id: conversationId,
      sender: '平台',
      sender_role: 'platform',
      content: `需求「${requirement.title}」已关联开发者，进入沟通。`,
      message_type: 'card',
      action_type: 'requirement.linked',
      action_ref: code,
      created_at: requirement.created_time ?? requirement.updated_at,
    },
    {
      id: nextMessageId++,
      conversation_id: conversationId,
      sender: DEV_USERNAME,
      sender_role: 'developer',
      content: '演示消息：我已看过需求与验收标准，可以按这个范围开工。',
      message_type: 'text',
      action_type: null,
      action_ref: null,
      created_at: requirement.updated_at,
    },
    {
      id: nextMessageId++,
      conversation_id: conversationId,
      sender: customer,
      sender_role: 'customer',
      content: '演示消息：好的，有问题随时在这里同步。',
      message_type: 'text',
      action_type: null,
      action_ref: null,
      created_at: requirement.updated_at,
    },
  ]
}

function messagesOf(code: string): MockMessage[] {
  const existing = messageStore.get(code)
  if (existing) {
    return existing
  }

  const seeded = seedMessages(code)
  messageStore.set(code, seeded)
  return seeded
}

function detailOf(request: MockRequest, code: string): RequirementConversationDetail | null {
  const conversation = buildConversation(request, code)
  if (!conversation) {
    return null
  }

  return { conversation, messages: messagesOf(code) }
}

/* ------------------------------------------------------------------ 实时流 */

function createEventStream(code: string, request: MockRequest): Response {
  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // 流已被取消，忽略
        }
      }

      const detail = detailOf(request, code)
      if (detail) {
        push(`event: conversation.updated\ndata: ${JSON.stringify(detail)}\n\n`)
      } else {
        push(': mock 实时流已连接（当前没有会话）\n\n')
      }

      heartbeat = setInterval(() => {
        push(`: keep-alive ${Date.now()}\n\n`)
      }, SSE_HEARTBEAT_MS)
    },
    cancel() {
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

const routes: MockRoute[] = [
  {
    method: 'GET',
    path: '/conversations/',
    note: '我的会话列表',
    handler: (request) =>
      jsonResponse(
        visibleRequirements(request)
          .map((item) => buildConversation(request, item.requirement_id))
          .filter((item): item is RequirementConversation => item !== null),
      ),
  },
  {
    method: 'GET',
    path: '/conversations',
    note: '我的会话列表（不带斜杠的写法）',
    handler: (request) =>
      jsonResponse(
        visibleRequirements(request)
          .map((item) => buildConversation(request, item.requirement_id))
          .filter((item): item is RequirementConversation => item !== null),
      ),
  },
  {
    method: 'GET',
    path: '/conversations/events',
    note: '实时事件流（SSE）：首帧推当前会话，之后只发心跳',
    handler: (request) => {
      const code = request.query.get('requirement_id') ?? ''
      return createEventStream(code, request)
    },
  },
  {
    method: 'GET',
    path: '/conversations/history-disclosures',
    note: '与我相关的历史沟通公开申请：演示数据没有',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/conversations/history-disclosures/requirement/:requirementId',
    note: '申请公开历史沟通：mock 直接放行并返回会话详情',
    handler: (request, params) => {
      const detail = detailOf(request, params.requirementId ?? '')
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/history-disclosures/:disclosureId/respond',
    note: '历史沟通申请表决',
    handler: () =>
      jsonResponse({
        id: 1,
        requirement_id: '',
        status: 'approved',
        created_at: nowText(),
        responded_at: nowText(),
      }),
  },
  {
    method: 'GET',
    path: '/conversations/requirement/:requirementId',
    note: '按需求取会话详情',
    handler: (request, params) => {
      const detail = detailOf(request, params.requirementId ?? '')
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/:conversationId/messages/attachment',
    note: '发带附件的消息（mock 只记文本，不存文件）',
    handler: (request, params) => {
      const code = String(params.conversationId ?? '').replace(/^CONV-/, '')
      const list = messagesOf(code)
      const body = (request.body ?? {}) as { content?: string; file_name?: string }

      list.push({
        id: nextMessageId++,
        conversation_id: params.conversationId ?? '',
        sender: request.identity === 'dev' ? DEV_USERNAME : (findRequirement(code)?.creator ?? ''),
        sender_role: request.identity === 'dev' ? 'developer' : 'customer',
        content: body.content ?? '',
        attachment_url: '/uploads/mock-attachment.pdf',
        attachment_name: body.file_name ?? 'mock-attachment.pdf',
        attachment_mime: 'application/pdf',
        attachment_size: 1024,
        message_type: 'text',
        action_type: null,
        action_ref: null,
        created_at: nowText(),
      })

      const detail = detailOf(request, code)
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/conversations/:conversationId/messages',
    note: '发消息：追加到内存会话并回整份详情（前端用返回值刷新列表）',
    handler: (request, params) => {
      const code = String(params.conversationId ?? '').replace(/^CONV-/, '')
      const requirement = findRequirement(code)
      const list = messagesOf(code)
      const body = (request.body ?? {}) as { content?: string }

      list.push({
        id: nextMessageId++,
        conversation_id: params.conversationId ?? '',
        sender: request.identity === 'dev' ? DEV_USERNAME : (requirement?.creator ?? ''),
        sender_role: request.identity === 'dev' ? 'developer' : 'customer',
        content: body.content ?? '',
        message_type: 'text',
        action_type: null,
        action_ref: null,
        created_at: nowText(),
      })

      const detail = detailOf(request, code)
      return detail ? jsonResponse(detail) : textResponse('会话不存在', 404)
    },
  },
]

export const conversationRoutes = defineRouteTable('conversations', routes)
