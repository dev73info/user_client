import { computed, type Ref } from 'vue'

import type { DevDashboardSnapshot } from '@/api/devDashboard'
import type { useDevHomeDashboard } from './useDevHomeDashboard'
import { CHART_BUCKETS, type DevHomeIncomeBucket } from './useIncomeChart'
import { DEMO_DEV_HOME_DAILY_INCOME } from '@/shared/devHomeMock'
import { dayKey, pad2 } from '@/shared/devHomeTime'
import { parseBackendDateTime } from '@/shared/datetime'

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeIncomeChartOptions = {
  /** 全屏且已拿到快照时的那一份（`useDevHomeBoard` 的 `liveBoard`）。 */
  liveBoard: Ref<DevDashboardSnapshot | null>
  overview: DashboardState['overview']
  mockEnabled: boolean
}

/**
 * 开发者总览页「近 7 天到账」曲线与「需求单 → 已到账尾款」映射（R047 从 `views/DevHomeView.vue` 拆出）。
 *
 * 曲线口径与拆出前一致：近 7 天（含今天）的到账金额，最早一天在左（窗口长度取 `useIncomeChart` 的
 * `CHART_BUCKETS`）。后端没有时间序列接口 —— 演示模式用自带序列，真实模式把最近到账记录按到账日归集；
 * 真实模式接口最多返回 100 笔，所以这条曲线是「最近到账的分布」，不是完整流水。
 * 全屏看板改画快照自带的近 30 天日序列（从旧到新、无收入补 0），由条数决定横轴标题里的天数。
 */
export function useDevHomeIncomeChart(options: DevHomeIncomeChartOptions) {
  /** 近 7 天曲线的原料：到账回执（全屏看板改画快照自带的 30 天序列，见 `incomeBuckets`）。 */
  const recentIncome = computed(() => options.overview.value?.recent_income ?? [])

  /** 需求单 → 已到账尾款金额：交付行右侧用它显示这一单回款了多少。 */
  const incomeByRequirement = computed(() => {
    const map = new Map<string, number>()
    for (const item of recentIncome.value) {
      map.set(item.requirement_id, (map.get(item.requirement_id) ?? 0) + item.amount_cny)
    }

    return map
  })

  const incomeBuckets = computed<DevHomeIncomeBucket[]>(() => {
    // 全屏看板改画近 30 天：快照自带完整日序列（从旧到新、无收入补 0），不再从到账明细里归集
    const board = options.liveBoard.value
    if (board && board.income_daily.length) {
      return board.income_daily.map((item) => ({
        label: `${item.date.slice(5, 7)}/${item.date.slice(8, 10)}`,
        value: item.amount_cny,
      }))
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const byDay = new Map<string, number>()
    if (options.mockEnabled) {
      DEMO_DEV_HOME_DAILY_INCOME.forEach((amount, index) => {
        const date = new Date(today)
        date.setDate(date.getDate() - (DEMO_DEV_HOME_DAILY_INCOME.length - 1 - index))
        byDay.set(dayKey(date), amount)
      })
    } else {
      for (const item of recentIncome.value) {
        const paidAt = parseBackendDateTime(item.paid_at)
        if (!paidAt) {
          continue
        }
        byDay.set(dayKey(paidAt), (byDay.get(dayKey(paidAt)) ?? 0) + item.amount_cny)
      }
    }

    const buckets: DevHomeIncomeBucket[] = []
    for (let offset = CHART_BUCKETS - 1; offset >= 0; offset -= 1) {
      const date = new Date(today)
      date.setDate(date.getDate() - offset)
      buckets.push({
        label: `${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`,
        value: byDay.get(dayKey(date)) ?? 0,
      })
    }

    return buckets
  })

  /**
   * 横轴标题里的天数：真机画近 7 天、全屏看板画快照自带的近 30 天，由数据条数决定。
   * 画布尺寸、坐标换算、峰值与悬停状态都在 `useIncomeChart` / `DevIncomeTrendChart`，这里只决定取哪几天的数。
   */
  const chartDays = computed(() => incomeBuckets.value.length)

  const chartCaption = computed(() => {
    if (options.liveBoard.value) {
      return `近 ${chartDays.value} 天每日到账（毛额）`
    }

    return options.mockEnabled
      ? '演示数据：近 7 天完整序列'
      : '按最近到账记录绘制（最多取最近 100 笔）'
  })

  return { incomeBuckets, chartDays, chartCaption, incomeByRequirement }
}
