import { nextTick, ref } from 'vue'

import type { SupportMessage } from '@/api/support'
import { parseBackendDateTime } from '@/shared/datetime'

export function useSupportChatMessages() {
  const messages = ref<Array<SupportMessage & { time: string }>>([])
  const bodyRef = ref<HTMLElement | null>(null)

  function setBodyRef(el: unknown) {
    bodyRef.value = (el as HTMLElement | null) ?? null
  }

  function formatTime(value: string): string {
    const date = parseBackendDateTime(value)
    return date?.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) ?? ''
  }

  async function scrollToBottom() {
    await nextTick()
    if (bodyRef.value) bodyRef.value.scrollTop = bodyRef.value.scrollHeight
  }

  function setMessages(items: SupportMessage[]) {
    messages.value = items.map((message) => ({
      ...message,
      time: formatTime(message.created_at),
    }))
    void scrollToBottom()
  }

  function appendMessage(message: SupportMessage) {
    if (messages.value.some((item) => item.id === message.id)) return
    messages.value.push({ ...message, time: formatTime(message.created_at) })
    void scrollToBottom()
  }

  return { messages, setBodyRef, setMessages, appendMessage }
}
