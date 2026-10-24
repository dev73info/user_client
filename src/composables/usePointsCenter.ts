import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { usePointsLedger } from '@/composables/usePointsLedger'
import { usePointsTransfer } from '@/composables/usePointsTransfer'
import type { PointsRecordTab } from '@/shared/pointsDisplay'
import { useAuthStore } from '@/stores/auth'

/**
 * 「我的背包 → 积分中心」的数据与动作。
 *
 * 从 `views/PointsCenterView.vue` 抽出：页面只负责排版，取数、两段记录的分页与筛选、
 * 打赏弹窗与提交都在这里。余额读数、积分记录（打赏记录 / 积分明细两段切换）、积分打赏
 * 弹窗三块拼成这一页；权益已拆到「权益中心」、券包已拆到「优惠券中心」、评论警告已移到
 * 「系统通知」，这一页不再一屏铺四件事。
 *
 * 两段各自是一支成品 composable（服务端分页的明细 / 前端筛选的打赏记录），这里只做编排：
 * 页面级刷新、两段之间的收尾（打完赏重取明细并切回打赏段）、进页面的登录守卫。
 */
export function usePointsCenter() {
  const router = useRouter()
  const auth = useAuthStore()

  const refreshing = ref(false)
  /** 记录区两段：打赏记录与积分明细。切 tab 只切显示、不重新请求。 */
  const activeRecordTab = ref<PointsRecordTab>('transfers')

  const ledger = usePointsLedger()
  const transfer = usePointsTransfer({
    reloadLedger: () => ledger.loadPoints(),
    onTransferred: () => {
      activeRecordTab.value = 'transfers'
    },
  })

  /** 读数条的刷新：余额与打赏记录各刷一次，日志有自己的分页与刷新口径。 */
  async function refreshOverview() {
    refreshing.value = true
    try {
      await Promise.all([ledger.loadPoints(), transfer.loadTransfers()])
    } finally {
      refreshing.value = false
    }
  }

  onMounted(async () => {
    auth.hydrate()
    if (!auth.isAuthed) {
      router.replace('/')
      return
    }
    await Promise.all([ledger.loadPoints(), transfer.loadTransferMeta(), transfer.loadTransfers()])
  })

  return {
    auth,
    refreshing,
    activeRecordTab,
    refreshOverview,
    ...ledger,
    ...transfer,
  }
}
