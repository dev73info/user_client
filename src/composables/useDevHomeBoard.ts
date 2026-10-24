import { computed, type Ref } from 'vue'

import type { DevWalletOverview } from '@/api/devWallet'
import type { useDevHomeDashboard } from './useDevHomeDashboard'
import type { DevHomeIncomeRow, DevHomeStatCard } from '@/shared/devHomeDisplay'
import { formatBackendDateTime } from '@/shared/datetime'

/** 首页只报最近几笔到账，完整流水在收益钱包页。 */
const RECENT_INCOME_LIMIT = 5

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeBoardOptions = {
  overview: DashboardState['overview']
  loaded: Ref<boolean>
  activeProjectCount: DashboardState['activeProjectCount']
  pendingDeliveryCount: DashboardState['pendingDeliveryCount']
  completedProjectCount: DashboardState['completedProjectCount']
}

/**
 * 开发者总览页**读数**那一路：顶部三格读数与「近期到账」的行。
 *
 * 口径：
 * - 三格读数全部来自 `GET /api/requirement/dev/mine` 这份列表按 `status` 现算（算在数据层），
 *   这里只负责格式化成读数条要的「标签 + 字符串」；
 * - 还没读到（`loaded` 为 false，含加载失败）时三格一律显示「—」——把「没拿到」写成 0
 *   等于替后端回答「你一个单都没有」；
 * - 近期到账直接来自钱包概览的 `recent_income`（契约里最多一屏的量），按到账时间倒序取前 5 笔。
 */
export function useDevHomeBoard(options: DevHomeBoardOptions) {
  /** 读数条数值：没读到数据时是「—」，不是 0。 */
  function reading(value: number): string {
    return options.loaded.value ? String(value) : '—'
  }

  const statCards = computed<DevHomeStatCard[]>(() => [
    { label: '进行中项目', value: reading(options.activeProjectCount.value) },
    { label: '待交付', value: reading(options.pendingDeliveryCount.value) },
    { label: '已完成项目', value: reading(options.completedProjectCount.value) },
  ])

  /**
   * 近期到账的行：`paid_at` 是东八区墙钟串，格式化走 `shared/datetime`；
   * 排序用字符串比较（`YYYY-MM-DD HH:MM:SS` 定长，字典序即时间序），不解析成 `Date` 再比。
   */
  const incomeRows = computed<DevHomeIncomeRow[]>(() => {
    const items = options.overview.value?.recent_income ?? []

    return [...items]
      .sort((left, right) => right.paid_at.localeCompare(left.paid_at))
      .slice(0, RECENT_INCOME_LIMIT)
      .map((item: DevWalletOverview['recent_income'][number]) => ({
        key: item.payment_id,
        title: item.title,
        customer: item.customer,
        requirementId: item.requirement_id,
        amount: item.amount_cny,
        timeText: formatBackendDateTime(item.paid_at),
      }))
  })

  return { statCards, incomeRows }
}
