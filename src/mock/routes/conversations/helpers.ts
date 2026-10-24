import {
  type RequirementConversation,
  type RequirementConversationDetail,
} from '@/shared/conversations'
import type { MockRequirementRow } from '../../db/requirements'
import { DEV_USERNAME, findRequirement, requirements } from '../../db'
import { type MockRequest } from '../../router'

export const SSE_HEARTBEAT_MS = 20_000

export function nowText(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

export function conversationIdOf(requirementCode: string): string {
  return `CONV-${requirementCode}`
}

/** 有开发者的需求才有会话；客户看到自己全部有开发者的单，开发者看自己的接单。 */
export function visibleRequirements(request: MockRequest): MockRequirementRow[] {
  return requirements.filter((item) => {
    if (!item.developer) {
      return false
    }
    return request.identity === 'dev' ? item.developer === DEV_USERNAME : true
  })
}

export function buildConversation(
  request: MockRequest,
  code: string,
): RequirementConversation | null {
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
    status:
      requirement.status === 'completed' || requirement.status === 'cancelled' ? 'closed' : 'open',
    requirement_status: requirement.status,
    unread_count: unreadCountOf(request, code),
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

/**
 * 已读位置：mock 里按「身份 + 会话」记最后已读的消息 id，打开会话（`POST /read`）时推到最新一条。
 *
 * 未读口径与真实后端一致：别人发的、且在已读位置之后的消息数。
 * 这里不预置已读位置（真实后端首次上线会把存量会话视为已读），
 * 于是演示数据一进来就能看到未读角标，标记已读后又立刻归零。
 */
export const readStore = new Map<string, number>()

export function readKey(request: MockRequest, code: string): string {
  return `${request.identity}:${conversationIdOf(code)}`
}

export function currentUsername(request: MockRequest, code: string): string {
  return request.identity === 'dev' ? DEV_USERNAME : (findRequirement(code)?.creator ?? '')
}

export function unreadCountOf(request: MockRequest, code: string): number {
  const lastRead = readStore.get(readKey(request, code)) ?? 0
  const mine = currentUsername(request, code)
  return messagesOf(code).filter((message) => message.sender !== mine && message.id > lastRead)
    .length
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

export const messageStore = new Map<string, MockMessage[]>()
let nextMessageId = 1

/** 分配下一条消息 id（等价于原先在各 handler 里直接写 `nextMessageId++`）。 */
export function allocateMessageId(): number {
  return nextMessageId++
}

export function seedMessages(code: string): MockMessage[] {
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

export function messagesOf(code: string): MockMessage[] {
  const existing = messageStore.get(code)
  if (existing) {
    return existing
  }

  const seeded = seedMessages(code)
  messageStore.set(code, seeded)
  return seeded
}

export function detailOf(request: MockRequest, code: string): RequirementConversationDetail | null {
  const conversation = buildConversation(request, code)
  if (!conversation) {
    return null
  }

  return { conversation, messages: messagesOf(code), has_more: false }
}

/* ------------------------------------------------------------------ 实时流 */

export function createEventStream(code: string, request: MockRequest): Response {
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
