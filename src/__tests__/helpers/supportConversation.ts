import type { SupportConversation, SupportConversationDetail, SupportMessage } from '@/api/support'

export class FakeSupportSocket {
  static instances: FakeSupportSocket[] = []
  url: string
  closed = false
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSupportSocket.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emitOpen() {
    this.onopen?.(new Event('open'))
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent)
  }

  emitClose() {
    this.closed = true
    this.onclose?.({} as CloseEvent)
  }
}

export function latestSupportSocket(): FakeSupportSocket {
  const socket = FakeSupportSocket.instances.at(-1)
  if (!socket) throw new Error('还没有建立客服连接')
  return socket
}

export function supportConversation(patch: Partial<SupportConversation> = {}): SupportConversation {
  return {
    id: 1,
    conversation_no: 'SC-1',
    user_username: 'alice',
    user_role: 'user',
    agent_username: null,
    status: 'open',
    priority: 'normal',
    last_message: null,
    last_message_at: null,
    last_message_by: null,
    unread_agent: 0,
    unread_user: 0,
    agent_last_read_message_id: null,
    user_last_read_message_id: null,
    created_at: '2026-10-28 00:00:00',
    updated_at: '2026-10-28 00:00:00',
    ...patch,
  }
}

export function supportMessage(patch: Partial<SupportMessage> = {}): SupportMessage {
  return {
    id: 1,
    conversation_id: 1,
    sender_username: 'alice',
    sender_role: 'user',
    content: '用户提问',
    created_at: '2026-10-28 00:00:00',
    ...patch,
  }
}

export function supportDetail(
  id: number,
  messages: SupportMessage[],
  patch: Partial<SupportConversation> = {},
): SupportConversationDetail {
  return {
    conversation: supportConversation({
      id,
      user_last_read_message_id: messages[0]?.id ?? null,
      ...patch,
    }),
    messages,
  }
}
