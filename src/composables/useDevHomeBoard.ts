import { computed, type Ref } from 'vue'

import type { DevDashboardSnapshot, DevDashboardPipeline } from '@/api/devDashboard'
import type { useDevHomeDashboard } from './useDevHomeDashboard'
import { buildFeedRows, buildResourceCells, type DevHomeStatCard } from '@/shared/devHomeDisplay'
import { STATUS_TONES, type DevHomeTone } from '@/shared/devHomeDisplay'
import { requirementStatusLabel } from '@/shared/requirementStatus'
import { money } from '@/shared/devFundDisplay'
import { dayKey, pad2, WEEKDAY_LABELS } from '@/shared/devHomeTime'

/**
 * 在途五档：漏斗与读数条「进行中项目」共用，顺序即流程顺序。`completed_this_month` 不在这里，
 * 它是漏斗的最后一格（本月完成），不参与「进行中」的求和。
 */
export const PIPELINE_STAGES: ReadonlyArray<
  Exclude<keyof DevDashboardPipeline, 'completed_this_month'>
> = ['pending_deposit', 'deposit_paid', 'in_development', 'pending_final', 'pending_settlement']

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeBoardOptions = {
  isFullscreen: Ref<boolean>
  dashboard: DashboardState['dashboard']
  overview: DashboardState['overview']
  activeProjectCount: DashboardState['activeProjectCount']
  completedProjectCount: DashboardState['completedProjectCount']
  pendingDeliveryCount: DashboardState['pendingDeliveryCount']
  /** 看板时钟（`useFullscreen` 每秒推进） */
  now: Ref<number>
}

/**
 * 开发者总览页**全屏看板**那一路的读数（R047 从 `views/DevHomeView.vue` 拆出）：
 * 快照与实时读数的取舍、四格统计卡、接单漏斗、动态流与资源概况的行、看板时钟。
 *
 * 口径与拆出前逐条一致：
 * - 全屏且已拿到快照（`liveBoard`）时，读数改走快照、跟着推送实时变化；非全屏仍是进页那一次拉取；
 * - 统计卡「累计收入」固定取后端给的累计到账金额（快照不参与）；
 * - 漏斗只在全屏有快照时出格；`deposit_paid` 拿不到单条支付模式，按统一口径两义并写；
 * - 动态流的「今天」由看板时钟决定，跨零点整列时间要跟着翻。
 */
export function useDevHomeBoard(options: DevHomeBoardOptions) {
  /** 全屏且已拿到快照：看板上的读数改走快照，跟着推送实时变化；非全屏仍是进页那一次拉取。 */
  const liveBoard = computed<DevDashboardSnapshot | null>(() =>
    options.isFullscreen.value ? options.dashboard.value : null,
  )

  /** 四格统计卡读数：三格按接单状态分档，收入固定取后端给的累计到账金额。 */
  const statCards = computed<DevHomeStatCard[]>(() => {
    const board = liveBoard.value
    const active = board
      ? PIPELINE_STAGES.reduce((sum, stage) => sum + board.pipeline[stage], 0)
      : options.activeProjectCount.value
    const completed = board
      ? board.wallet.total_completed_orders
      : options.completedProjectCount.value
    const pendingDelivery = board
      ? board.pipeline.pending_final
      : options.pendingDeliveryCount.value

    return [
      {
        label: '进行中项目',
        value: String(active),
      },
      {
        label: '已完成项目',
        value: String(completed),
      },
      {
        label: '待交付',
        value: String(pendingDelivery),
      },
      {
        label: '累计收入',
        value: money(options.overview.value?.total_income_cny),
      },
    ]
  })

  /** 接单漏斗：五个在途状态 + 本月完成。`deposit_paid` 拿不到单条的支付模式，按统一口径两义并写。 */
  const funnelCells = computed(() => {
    const board = liveBoard.value
    if (!board) {
      return []
    }

    const stages = PIPELINE_STAGES.map((stage) => ({
      key: stage,
      label: requirementStatusLabel(stage),
      value: board.pipeline[stage],
      tone: STATUS_TONES[stage] ?? 'blue',
    }))
    const peak = Math.max(1, ...stages.map((stage) => stage.value))

    return [
      ...stages.map((stage) => ({ ...stage, share: stage.value / peak, done: false })),
      {
        key: 'completed_this_month',
        label: '本月完成',
        value: board.pipeline.completed_this_month,
        tone: 'cyan' as DevHomeTone,
        share: 1,
        done: true,
      },
    ]
  })

  /**
   * 动态流与资源概况的行：图标 / 色调 / 时间文案 / 键怎么拼在 `buildFeedRows`，
   * 这里只把数据交给它，并给出「哪一天算今天」——那由看板时钟决定，跨零点时整列时间要跟着翻。
   */
  const feedRows = computed(() =>
    liveBoard.value ? buildFeedRows(liveBoard.value.feed, dayKey(new Date(options.now.value))) : [],
  )

  const resourceCells = computed(() =>
    liveBoard.value ? buildResourceCells(liveBoard.value.resources) : [],
  )

  /** 看板时钟的 `now` 由 `useFullscreen` 每秒推进；时间文案留在这里，与读数条同一种写法。 */
  const clockTime = computed(() => {
    const date = new Date(options.now.value)
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  })

  const clockDate = computed(() => {
    const date = new Date(options.now.value)
    return `${date.getMonth() + 1}月${date.getDate()}日 周${WEEKDAY_LABELS[date.getDay()]}`
  })

  return { liveBoard, statCards, funnelCells, feedRows, resourceCells, clockTime, clockDate }
}
