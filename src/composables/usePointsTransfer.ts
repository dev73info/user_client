import { computed, ref, watch } from 'vue'
import { TMessage } from 'ui_73info'

import {
  getTransferMeta,
  listMyTransfers,
  transferPoints,
  type PointsTransfer,
  type PointsTransferMeta,
} from '@/api/points'
import { useClientPagination } from '@/composables/useClientPagination'
import { describeBackendError } from '@/shared/backendErrorText'
import {
  pointsTransferMatchesKeyword,
  pointsTransferMatchesScope,
  pointsTransferScopes,
  type TransferScope,
} from '@/shared/pointsDisplay'
import { useAuthStore } from '@/stores/auth'

export function usePointsTransfer(hooks: {
  reloadLedger: () => Promise<unknown>
  onTransferred?: () => void
}) {
  const auth = useAuthStore()
  const transferMeta = ref<PointsTransferMeta | null>(null)
  const metaError = ref('')
  const transferTo = ref('')
  const transferAmount = ref<number | null>(null)
  const transferNote = ref('')
  const transferSaving = ref(false)
  const transferLoading = ref(false)
  const transferError = ref('')
  const transfers = ref<PointsTransfer[]>([])
  const transferDialogVisible = ref(false)
  const feeRate = computed(() => transferMeta.value?.fee_rate ?? null)
  const transferKeyword = ref('')
  const transferScope = ref<TransferScope>('all')
  const transferScopes = computed(() => pointsTransferScopes(transfers.value, auth.username))
  const filteredTransfers = computed(() =>
    transfers.value.filter(
      (item) =>
        pointsTransferMatchesScope(item, transferScope.value, auth.username) &&
        pointsTransferMatchesKeyword(item, transferKeyword.value),
    ),
  )
  const transferFiltersActive = computed(
    () => transferKeyword.value.trim() !== '' || transferScope.value !== 'all',
  )
  const {
    page: transferPage,
    pageSize: transferPageSize,
    total: transferTotal,
    paged: pagedTransfers,
    resetPage: resetTransferPage,
  } = useClientPagination(filteredTransfers)

  watch([transferKeyword, transferScope], resetTransferPage)

  function resetTransferFilters() {
    transferKeyword.value = ''
    transferScope.value = 'all'
  }

  async function loadTransferMeta() {
    if (!auth.token) return
    metaError.value = ''
    try {
      transferMeta.value = await getTransferMeta(auth.token)
    } catch (err) {
      transferMeta.value = null
      metaError.value = describeBackendError(err, '加载打赏规则失败')
    }
  }

  async function loadTransfers() {
    if (!auth.token) return
    transferLoading.value = true
    transferError.value = ''
    try {
      transfers.value = await listMyTransfers(auth.token)
    } catch (err) {
      transferError.value = describeBackendError(err, '加载打赏记录失败')
    } finally {
      transferLoading.value = false
    }
  }

  async function submitTransfer() {
    if (!auth.token || transferSaving.value) return
    const to = transferTo.value.trim()
    const amount = transferAmount.value
    if (!to) {
      TMessage.warning('请输入接收方用户名')
      return
    }
    if (!amount || amount <= 0) {
      TMessage.warning('请输入打赏金额')
      return
    }
    transferSaving.value = true
    try {
      const result = await transferPoints(auth.token, {
        to_username: to,
        amount,
        note: transferNote.value.trim() || undefined,
      })
      TMessage.success(result.pending_review ? '已提交，等待审核' : '打赏成功')
      transferDialogVisible.value = false
      resetTransferForm()
      hooks.onTransferred?.()
      await Promise.all([hooks.reloadLedger(), loadTransfers()])
    } catch (err) {
      TMessage.error(describeBackendError(err, '打赏失败'))
    } finally {
      transferSaving.value = false
    }
  }

  function resetTransferForm() {
    transferTo.value = ''
    transferAmount.value = null
    transferNote.value = ''
  }

  return {
    transferMeta,
    metaError,
    transferTo,
    transferAmount,
    transferNote,
    transferSaving,
    transferLoading,
    transferError,
    transfers,
    transferDialogVisible,
    feeRate,
    transferKeyword,
    transferScope,
    transferScopes,
    filteredTransfers,
    transferFiltersActive,
    transferPage,
    transferPageSize,
    transferTotal,
    pagedTransfers,
    resetTransferFilters,
    resetTransferForm,
    loadTransferMeta,
    loadTransfers,
    submitTransfer,
  }
}
