import { ref, type Ref } from 'vue'

import { rateSupportConversation, type SupportConversation } from '@/api/support'

export function useSupportChatSatisfaction(
  token: () => string,
  conversation: Ref<SupportConversation | null>,
  onUpdated: (next: SupportConversation) => void,
) {
  const submitting = ref(false)
  const error = ref('')

  async function submit(rating: number, comment: string) {
    const current = conversation.value
    const authToken = token().trim()
    if (!current || !authToken || submitting.value) return
    if (current.status !== 'closed') {
      error.value = '会话结束后才能评价'
      return
    }
    submitting.value = true
    error.value = ''
    try {
      const updated = await rateSupportConversation(
        authToken,
        current.id,
        rating,
        comment.trim() || null,
      )
      if (token().trim() === authToken) onUpdated(updated)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '提交评价失败'
    } finally {
      if (token().trim() === authToken) submitting.value = false
    }
  }

  return { submitting, error, submit }
}
