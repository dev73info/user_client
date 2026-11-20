import { nextTick, ref } from 'vue'

import type { SupportMessage } from '@/api/support'
import { parseBackendDateTime } from '@/shared/datetime'

export type SupportChatMessage = SupportMessage & {
  time: string
  day: string
  showDay: boolean
  continuation: boolean
}

function dateParts(value: string) {
  const date = parseBackendDateTime(value)
  if (!date) return { key: '', label: '' }
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
  const sameDay = (candidate: Date) =>
    candidate.getFullYear() === date.getFullYear() &&
    candidate.getMonth() === date.getMonth() &&
    candidate.getDate() === date.getDate()
  const label = sameDay(now)
    ? '今天'
    : sameDay(yesterday)
      ? '昨天'
      : date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
  return { key, label }
}

function decorateMessages(items: SupportMessage[]): SupportChatMessage[] {
  let previousSender = ''
  let previousAt = 0
  let previousDay = ''
  return items.map((message) => {
    const parsed = parseBackendDateTime(message.created_at)
    const timestamp = parsed?.getTime() ?? 0
    const day = dateParts(message.created_at)
    const continuation =
      previousSender === message.sender_role &&
      previousAt > 0 &&
      timestamp > 0 &&
      timestamp - previousAt < 5 * 60_000
    previousSender = message.sender_role
    previousAt = timestamp
    const showDay = day.key !== previousDay
    previousDay = day.key
    return {
      ...message,
      time: parsed?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) ?? '',
      day: day.label,
      showDay,
      continuation,
    }
  })
}

export function useSupportChatMessages() {
  const messages = ref<SupportChatMessage[]>([])
  const bodyRef = ref<HTMLElement | null>(null)

  function setBodyRef(el: unknown) {
    bodyRef.value = (el as HTMLElement | null) ?? null
  }

  async function scrollToBottom() {
    await nextTick()
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  }

  function setMessages(items: SupportMessage[]) {
    messages.value = decorateMessages(items)
    void scrollToBottom()
  }

  function appendMessage(message: SupportMessage) {
    if (messages.value.some((item) => item.id === message.id)) return
    messages.value = decorateMessages([...messages.value, message])
    void scrollToBottom()
  }

  return { messages, setBodyRef, setMessages, appendMessage }
}
