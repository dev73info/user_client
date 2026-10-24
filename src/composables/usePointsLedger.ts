import { computed, ref } from 'vue'
import { type SelectModelValue } from 'ui_73info'

import { HttpError } from '@/api/http'
import { getMyPoints, type UserPointsLog } from '@/api/points'
import { useAuthStore } from '@/stores/auth'

/**
 * 「积分明细」这一段的数据：取数、服务端分页、余额。
 *
 * 从 `views/PointsCenterView.vue` 抽出。明细走**服务端**分页（`/points/me` 带 page /
 * page_size，后端给 `logs_total` 时按后端口径翻页），与打赏记录那种「一次取回、前端过滤」
 * 的列表不是一套口径，所以单独放这里，不复用 `useClientPagination`。
 */
export function usePointsLedger() {
  const auth = useAuthStore()

  const logs = ref<UserPointsLog[]>([])
  const loading = ref(false)
  const error = ref('')
  /** 读数条用的余额：与日志分开存，日志只翻当前页、余额是全量口径。 */
  const pointsBalance = ref(0)

  const logPage = ref(1)
  const logPageSize = ref(10)
  const logTotal = ref(0)
  /** 后端是否给了分页字段：没给时整份 `logs` 就是全部，前端自己切。 */
  const serverPagedLogs = ref(true)

  const pagedLogs = computed(() => {
    if (serverPagedLogs.value) {
      return logs.value
    }

    const start = (logPage.value - 1) * logPageSize.value
    return logs.value.slice(start, start + logPageSize.value)
  })

  /**
   * 取一页明细。越界页（数据变少后停在最后一页之外）先夹到最后有效页再重取，
   * 否则会渲染出一张空列表、看上去像「没有明细」。
   */
  async function loadPoints(page = logPage.value, pageSize = logPageSize.value) {
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
      error.value = err instanceof HttpError ? err.message : '加载积分失败'
    } finally {
      loading.value = false
    }
  }

  function handleLogPageChange(page: number) {
    void loadPoints(page, logPageSize.value)
  }

  /* `TSelect` 的 `change` 是宽联合（单选一个值、多选一个数组），这里只需单值，
     所以收紧一次再写回。 */
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
