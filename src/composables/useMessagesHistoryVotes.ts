import { computed, ref } from 'vue'
import { TMessage } from 'ui_73info'
import {
  listConversationHistoryDisclosures,
  respondConversationHistoryDisclosure,
  type ConversationHistoryDisclosure,
} from '@/api/conversations'
import { useAuthStore } from '@/stores/auth'

/**
 * 历史沟通公开申请的表决（消息中心顶部的待办）。
 *
 * 前任开发者已经读不到这条会话（不再是参与方），所以由消息中心给他入口：
 * 两票里还差他这一票时列出来，他和客户各一票，两票齐才公开该段。
 */
export function useMessagesHistoryVotes() {
  const auth = useAuthStore()
  const historyDisclosures = ref<ConversationHistoryDisclosure[]>([])
  const votingId = ref<number | null>(null)

  /** 待我确认的历史沟通公开申请：只留状态 pending、且「我这一票还没投」的那些。 */
  const pendingVotes = computed(() =>
    historyDisclosures.value.filter((item) => {
      if (item.status !== 'pending') {
        return false
      }
      if (auth.username === item.previous_developer) {
        return item.developer_consent === 'pending'
      }
      if (auth.username === item.customer) {
        return item.customer_consent === 'pending'
      }
      return false
    }),
  )

  function clear() {
    historyDisclosures.value = []
  }

  async function load() {
    if (!auth.token.trim()) {
      clear()
      return
    }

    try {
      historyDisclosures.value = await listConversationHistoryDisclosures(auth.token)
    } catch {
      // 公开申请只是消息中心的附加待办，拉取失败不影响会话列表本身
      clear()
    }
  }

  async function respond(item: ConversationHistoryDisclosure, decision: 'approved' | 'rejected') {
    if (!auth.token.trim() || votingId.value !== null) {
      return
    }

    votingId.value = item.id
    try {
      await respondConversationHistoryDisclosure(auth.token, item.id, decision)
      TMessage.success(
        decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通',
      )
      await load()
    } catch (error) {
      TMessage.warning(error instanceof Error ? error.message : '提交表决失败')
    } finally {
      votingId.value = null
    }
  }

  return { pendingVotes, votingId, load, respond, clear }
}
