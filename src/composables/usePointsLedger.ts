import { computed, ref } from 'vue'
import { type SelectModelValue } from 'ui_73info'

import { getMyPoints, type UserPointsLog } from '@/api/points'
import { describeBackendError } from '@/shared/backendErrorText'
import { useAuthStore } from '@/stores/auth'

export function usePointsLedger() {
  const auth = useAuthStore()
  const logs = ref<UserPointsLog[]>([])
  const loading = ref(false)
  const error = ref('')
  const pointsBalance = ref(0)
  const logPage = ref(1)
  const logPageSize = ref(10)
  const logTotal = ref(0)
  const serverPagedLogs = ref(true)

  const pagedLogs = computed(() => {
    if (serverPagedLogs.value) return logs.value
    const start = (logPage.value - 1) * logPageSize.value
    return logs.value.slice(start, start + logPageSize.value)
  })

  async function loadPoints(page = logPage.value, pageSize = logPageSize.value) {
    if (!auth.token) {
      error.value = '请先登录后查看积分'
      return
    }
    loading.value = true
    error.value = ''
    try {
      const data = await getMyPoints(auth.token, { page, page_size: pageSize })
      const responseHasPagination = data.logs_total != null
      const total = data.logs_total ?? data.logs.length
      const lastPage = Math.max(1, Math.ceil(total / pageSize))
      const normalizedPage = Math.min(Math.max(1, page), lastPage)
      if (normalizedPage !== page) {
        logPage.value = normalizedPage
        await loadPoints(normalizedPage, pageSize)
        return
      }
      logs.value = data.logs
      pointsBalance.value = data.points_balance
      logTotal.value = total
      logPage.value = data.logs_page ?? page
      logPageSize.value = data.logs_page_size ?? pageSize
      serverPagedLogs.value = responseHasPagination
    } catch (err) {
      error.value = describeBackendError(err, '加载积分失败')
    } finally {
      loading.value = false
    }
  }

  function handleLogPageChange(page: number) {
    void loadPoints(page, logPageSize.value)
  }

  function handleLogPageSizeChange(value: SelectModelValue) {
    const pageSize = Number(value)
    logPage.value = 1
    logPageSize.value = pageSize
    void loadPoints(1, pageSize)
  }

  return {
    logs,
    loading,
    error,
    pointsBalance,
    logPage,
    logPageSize,
    logTotal,
    serverPagedLogs,
    pagedLogs,
    loadPoints,
    handleLogPageChange,
    handleLogPageSizeChange,
  }
}
