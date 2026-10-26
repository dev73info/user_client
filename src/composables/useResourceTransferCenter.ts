import { ref } from 'vue'

import {
  acceptPurchaseTransfer,
  cancelPurchaseTransfer,
  listIncomingPurchaseTransfers,
  listOutgoingPurchaseTransfers,
  rejectPurchaseTransfer,
} from '@/api/resourcePurchaseTransfers'
import {
  acceptResourceTransfer,
  cancelResourceTransfer,
  listMyResourceTransferInbox,
  listMyResourceTransfers,
  rejectResourceTransfer,
} from '@/api/resourceTransfers'
import { describeBackendError } from '@/shared/backendErrorText'
import type { TransferApplication, TransferKind } from '@/shared/resourceTransfer'
import { useAuthStore } from '@/stores/auth'
import { TMessage } from 'ui_73info'

export type TransferAction = 'accept' | 'reject' | 'cancel'

export function useResourceTransferCenter() {
  const auth = useAuthStore()
  const loading = ref(false)
  const errorMessage = ref('')
  const resourceIncoming = ref<TransferApplication[]>([])
  const resourceOutgoing = ref<TransferApplication[]>([])
  const purchaseIncoming = ref<TransferApplication[]>([])
  const purchaseOutgoing = ref<TransferApplication[]>([])
  const busyKey = ref('')

  async function load() {
    if (!auth.token) {
      errorMessage.value = '请先登录后查看过户申请'
      return
    }
    loading.value = true
    errorMessage.value = ''
    try {
      const [resourceInbox, resourceMine, purchaseInbox, purchaseMine] = await Promise.all([
        listMyResourceTransferInbox(auth.token),
        listMyResourceTransfers(auth.token),
        listIncomingPurchaseTransfers(auth.token),
        listOutgoingPurchaseTransfers(auth.token),
      ])
      resourceIncoming.value = resourceInbox
      resourceOutgoing.value = resourceMine
      purchaseIncoming.value = purchaseInbox
      purchaseOutgoing.value = purchaseMine
    } catch (error) {
      errorMessage.value = describeBackendError(error, '加载过户申请失败')
    } finally {
      loading.value = false
    }
  }

  async function execute(kind: TransferKind, item: TransferApplication, action: TransferAction) {
    if (!auth.token) {
      errorMessage.value = '登录状态已失效，请重新登录'
      return
    }
    if (busyKey.value) return
    busyKey.value = `${kind}:${item.transfer_id}`
    errorMessage.value = ''
    try {
      if (kind === 'resource') {
        if (action === 'accept') await acceptResourceTransfer(auth.token, item.transfer_id)
        if (action === 'reject') await rejectResourceTransfer(auth.token, item.transfer_id)
        if (action === 'cancel') await cancelResourceTransfer(auth.token, item.transfer_id)
      } else {
        if (action === 'accept') await acceptPurchaseTransfer(auth.token, item.transfer_id)
        if (action === 'reject') await rejectPurchaseTransfer(auth.token, item.transfer_id)
        if (action === 'cancel') await cancelPurchaseTransfer(auth.token, item.transfer_id)
      }
      TMessage.success(
        action === 'accept' ? '已接受' : action === 'reject' ? '已拒绝' : '已撤销申请',
      )
      await load()
    } catch (error) {
      errorMessage.value = describeBackendError(error, '处理过户申请失败')
      TMessage.error(errorMessage.value)
    } finally {
      busyKey.value = ''
    }
  }

  return {
    loading,
    errorMessage,
    resourceIncoming,
    resourceOutgoing,
    purchaseIncoming,
    purchaseOutgoing,
    busyKey,
    load,
    execute,
  }
}
