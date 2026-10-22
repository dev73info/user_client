import { ref } from 'vue'
import {
  acceptResourceTransfer,
  cancelResourceTransfer,
  rejectResourceTransfer,
} from '@/api/resourceTransfers'
import { respondConversationHistoryDisclosure } from '@/api/conversations'
import type { NotificationCard } from '@/shared/notifications'
import { describeTransferError } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

/**
 * 「系统通知」卡片上的动作（R047 从 `views/NotificationCenterView.vue` 拆出）：
 * 历史沟通公开申请的表决，以及资源过户的同意 / 拒绝 / 撤销。
 *
 * 两支动作有两处共同口径：
 * - **在途锁**：同一时刻只处理一条（`votingId` / `respondingTransferId` 非空时不再受理），
 *   否则连点两下会给后端发两次，第二次必然撞 409；
 * - **动作后自刷新**：投票只重拉公开申请那一支，过户动作只重拉两份过户列表——
 *   其它类别的数据不会因为这一下变化，整页重拉既慢又会把列表滚回顶部。
 *
 * 刷新用调用方传进来的函数（数据在 `useNotificationCenter` 里），本文件不碰列表状态。
 */
export function useNotificationCardActions(options: {
  /** 投票成功后重拉公开申请 */
  refreshDisclosures: () => Promise<void>
  /** 同意 / 拒绝 / 撤销过户后重拉过户列表 */
  refreshTransfers: () => Promise<void>
}) {
  const auth = useAuthStore()

  /** 正在投票的公开申请 id，用于给对应按钮显示 loading。 */
  const votingId = ref<number | null>(null)
  /** 正在处理（同意 / 拒绝 / 撤销）的过户申请 id，用于给对应按钮显示 loading。 */
  const respondingTransferId = ref<number | null>(null)

  /** 接收方同意 / 拒绝。同意后资源换主，刷新列表让卡片状态跟上。 */
  async function respondTransfer(card: NotificationCard, accepted: boolean) {
    if (!auth.token.trim() || card.transferId == null || respondingTransferId.value !== null) {
      return
    }

    const resourceName = card.transferResourceName || '该资源'
    if (accepted) {
      const confirmed = window.confirm(
        `同意接收资源「${resourceName}」吗？同意后该资源归你所有，原所有者将不再拥有它。`,
      )
      if (!confirmed) {
        return
      }
    }

    respondingTransferId.value = card.transferId
    try {
      if (accepted) {
        await acceptResourceTransfer(auth.token, card.transferId)
      } else {
        await rejectResourceTransfer(auth.token, card.transferId)
      }
      TMessage.success(accepted ? '已同意过户，资源已转入你的资源项目' : '已拒绝该过户申请')
    } catch (error) {
      const { message, needRefresh } = describeTransferError(
        error,
        accepted ? '同意过户失败' : '拒绝过户失败',
      )
      TMessage.error(message)
      if (!needRefresh) {
        return
      }
    } finally {
      respondingTransferId.value = null
    }
    await options.refreshTransfers()
  }

  /** 发起方撤销待处理的过户申请。 */
  async function cancelTransfer(card: NotificationCard) {
    if (!auth.token.trim() || card.transferId == null || respondingTransferId.value !== null) {
      return
    }

    respondingTransferId.value = card.transferId
    try {
      await cancelResourceTransfer(auth.token, card.transferId)
      TMessage.success('过户申请已撤销，资源归属保持不变')
    } catch (error) {
      const { message, needRefresh } = describeTransferError(error, '撤销过户失败')
      TMessage.error(message)
      if (!needRefresh) {
        return
      }
    } finally {
      respondingTransferId.value = null
    }
    await options.refreshTransfers()
  }

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

  return { votingId, respondingTransferId, respondTransfer, cancelTransfer, vote }
}
