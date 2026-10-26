import { ref } from 'vue'
import { respondConversationHistoryDisclosure } from '@/api/conversations'
import type { NotificationCard } from '@/shared/notifications'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 「系统通知」卡片上的动作：历史沟通公开申请的表决。
 *
 * 两支口径：
 * - **在途锁**：同一时刻只处理一条（`votingId` 非空时不再受理），否则连点两下会给后端发两次，
 *   第二次必然撞 409；
 * - **动作后自刷新**：只重拉公开申请那一支——解除合作案件与评论警告不会因为这一票变化，
 *   整页重拉既慢又会把列表滚回顶部。
 *
 * 刷新用调用方传进来的函数（数据在 `useNotificationCenter` 里），本文件不碰列表状态。
 *
 * 资源过户那套动作已随「资源过户」整体下线：当前后端契约里 `/resources/transfers/**` 一条都没有，
 * 留着按钮只会点出 404。
 */
export function useNotificationCardActions(options: {
  /** 投票成功后重拉公开申请 */
  refreshDisclosures: () => Promise<void>
}) {
  const auth = useAuthStore()

  /** 正在投票的公开申请 id，用于给对应按钮显示 loading。 */
  const votingId = ref<number | null>(null)

  /** 公开申请投票：同意或拒绝公开这段历史沟通。 */
  async function vote(card: NotificationCard, decision: 'approved' | 'rejected') {
    if (!auth.token.trim() || card.disclosureId == null || votingId.value !== null) {
      return
    }

    votingId.value = card.disclosureId
    try {
      await respondConversationHistoryDisclosure(auth.token, card.disclosureId, decision)
      TMessage.success(
        decision === 'approved' ? '已同意公开这段历史沟通' : '已拒绝公开这段历史沟通',
      )
      await options.refreshDisclosures()
    } catch (error) {
      TMessage.warning(error instanceof Error ? error.message : '提交表决失败')
    } finally {
      votingId.value = null
    }
  }

  return { votingId, vote }
}
