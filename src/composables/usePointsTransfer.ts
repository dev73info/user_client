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
import {
  pointsTransferMatchesKeyword,
  pointsTransferMatchesScope,
  pointsTransferScopes,
  type TransferScope,
} from '@/shared/pointsDisplay'
import { useAuthStore } from '@/stores/auth'

/**
 * 「打赏记录」这一段的数据与动作：规则、表单、记录列表、筛选、打赏提交。
 *
 * 从 `views/PointsCenterView.vue` 抽出。记录是一次全量取回（上限 50 条），筛选与分页都在
 * 前端做，所以用 `useClientPagination`（与其余菜单页同一套页码口径）。
 *
 * 两支钩子把「打完赏之后」的收尾交给页面：余额变了要重取明细、刚发生的那条在打赏段里
 * 要能被看到。本模块不直接引用明细那一段，避免两段互相 import。
 */
export function usePointsTransfer(hooks: {
  /** 打完赏后重取积分明细与余额。 */
  reloadLedger: () => Promise<unknown>
  /** 打赏成功后的收尾（页面把记录区切回打赏段）。 */
  onTransferred?: () => void
}) {
  const auth = useAuthStore()

  const transferMeta = ref<PointsTransferMeta | null>(null)
  const transferTo = ref('')
  const transferAmount = ref<number | null>(null)
  const transferNote = ref('')
  const transferSaving = ref(false)
  const transferLoading = ref(false)
  const transfers = ref<PointsTransfer[]>([])
  /** 打赏表单收在弹窗里：入口是「积分记录」卡头右侧那颗主按钮。 */
  const transferDialogVisible = ref(false)

  /** 手续费率来自后端规则；取不到时按 0 展示，不影响表单可用。弹窗用它算到账预览。 */
  const feeRate = computed(() => transferMeta.value?.fee_rate ?? 0)

  // 打赏记录的筛选：记录是一次全量取回（上限 50 条），所以筛选与分页都在前端做。
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

  // 筛选条件一变就回到第 1 页，否则从第 3 页开始筛会直接看到一张空列表。
  watch([transferKeyword, transferScope], resetTransferPage)

  function resetTransferFilters() {
    transferKeyword.value = ''
    transferScope.value = 'all'
  }

  async function loadTransferMeta() {
    if (!auth.token) return
    try {
      transferMeta.value = await getTransferMeta(auth.token)
    } catch {
      // 忽略，使用默认展示
    }
  }

  async function loadTransfers() {
    if (!auth.token) return
    transferLoading.value = true
    try {
      transfers.value = await listMyTransfers(auth.token)
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '加载打赏记录失败')
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
      await transferPoints(auth.token, {
        to_username: to,
        amount,
        note: transferNote.value.trim() || undefined,
      })
      TMessage.success('打赏成功')
      transferDialogVisible.value = false
      resetTransferForm()
      // 打完赏最想看到的是刚发生的那条，直接切到打赏记录那一段
      hooks.onTransferred?.()
      await Promise.all([hooks.reloadLedger(), loadTransfers()])
    } catch (err) {
      TMessage.error(err instanceof Error ? err.message : '打赏失败')
    } finally {
      transferSaving.value = false
    }
  }

  /** 关闭弹窗即清空：下次打开是一张干净的表单，不会带上一次没提交完的接收方与金额。 */
  function resetTransferForm() {
    transferTo.value = ''
    transferAmount.value = null
    transferNote.value = ''
  }

  return {
    transferMeta,
    transferTo,
    transferAmount,
    transferNote,
    transferSaving,
    transferLoading,
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
