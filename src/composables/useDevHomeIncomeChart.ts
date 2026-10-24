import { computed, type Ref } from 'vue'

import type { useDevHomeDashboard } from './useDevHomeDashboard'
import { CHART_BUCKETS, type DevHomeIncomeBucket } from './useIncomeChart'
import { backendDayKey, dayLabel, recentDayKeys } from '@/shared/devHomeTime'

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeIncomeChartOptions = {
  overview: DashboardState['overview']
  /** 还没读到钱包读数时不画曲线（0 线看起来像「一分钱没进」）。 */
  loaded: Ref<boolean>
}

/**
 * 开发者总览页「近 7 天到账」曲线。
 *
 * 后端没有时间序列接口：这里把钱包概览里的 `recent_income`（契约里最多 100 笔）按**到账日**
 * 归集成近 7 天，所以它是「最近到账的分布」，不是完整流水——图上的说明文案照这个口径写，
 * 不要写成「近 7 天收入」。日期分组一律按东八区自然日（见 `shared/devHomeTime`）。
 */
export function useDevHomeIncomeChart(options: DevHomeIncomeChartOptions) {
  const incomeBuckets = computed<DevHomeIncomeBucket[]>(() => {
    const days = recentDayKeys(CHART_BUCKETS)
    if (!options.loaded.value) {
      return days.map((key) => ({ label: dayLabel(key), value: 0 }))
    }

    const byDay = new Map<string, number>()
    for (const item of options.overview.value?.recent_income ?? []) {
      const key = backendDayKey(item.paid_at)
      if (!key) {
        continue
      }
      byDay.set(key, (byDay.get(key) ?? 0) + item.amount_cny)
    }

    return days.map((key) => ({ label: dayLabel(key), value: byDay.get(key) ?? 0 }))
  })

  const chartDays = computed(() => incomeBuckets.value.length)

  const chartCaption = computed(
    () => `近 ${chartDays.value} 天到账（按最近到账记录归集，最多取最近 100 笔）`,
  )

  return { incomeBuckets, chartDays, chartCaption }
}
