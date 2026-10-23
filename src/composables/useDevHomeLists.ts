import { computed, ref, type Ref } from 'vue'

import type { DevDashboardSnapshot } from '@/api/devDashboard'
import type { useDevHomeDashboard } from './useDevHomeDashboard'
import {
  STATUS_TONES,
  type DevHomeDeliveryRow,
  type DevHomeProjectRow,
} from '@/shared/devHomeDisplay'
import {
  isActiveRequirement,
  requirementProgressPercent,
  requirementStatusLabel,
} from '@/shared/requirementStatus'

/** 总览页只做汇总：列表最多展示 5 条，完整明细留在「我的接单」页。 */
const OVERVIEW_LIST_LIMIT = 5

/** 最近交付排成三列卡片，正好铺满一行；多出来的条数交给「查看全部」去「我的接单」看。 */
const DELIVERY_GRID_LIMIT = 3

type ProjectTabKey = 'all' | 'active' | 'pending' | 'completed'

const PROJECT_TABS: ReadonlyArray<{ key: ProjectTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'pending', label: '待交付' },
  { key: 'completed', label: '已完成' },
]

type DeliveryTabKey = 'all' | 'delivered' | 'pending'

const DELIVERY_TABS: ReadonlyArray<{ key: DeliveryTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'delivered', label: '已交付' },
  { key: 'pending', label: '未交付' },
]

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeListsOptions = {
  isFullscreen: Ref<boolean>
  /** 全屏且已拿到快照时的那一份（`useDevHomeBoard` 的 `liveBoard`）。 */
  liveBoard: Ref<DevDashboardSnapshot | null>
  requirements: DashboardState['requirements']
  resources: DashboardState['resources']
  /** 需求单 → 已到账尾款（`useDevHomeIncomeChart`），交付行右侧的金额取它。 */
  incomeByRequirement: Ref<Map<string, number>>
}

/**
 * 开发者总览页两张列表卡的行（R047 从 `views/DevHomeView.vue` 拆出）：进行中项目与最近交付。
 *
 * 「哪几档算进行中、全屏时不受 5 条 / 3 张的限制」这套口径留在这里；组件（`DevProjectList` /
 * `DevDeliveryList`）只画。与拆出前逐条一致：
 * - 终止态（`cancelled` / `rejected`）不进总览列表，留在「我的接单」里查；
 * - 全屏有快照时保持后端顺序（快照已按「在途在前、同组按更新时间倒序」排好），并把 `updated_at` 当创建时间用；
 * - 交付 = 绑定资源项目的资源版本，所以按「已绑定资源的需求单」汇总，资源标题查不到时回落「资源 #id」。
 */
export function useDevHomeLists(options: DevHomeListsOptions) {
  const activeProjectTab = ref<ProjectTabKey>('all')
  const activeDeliveryTab = ref<DeliveryTabKey>('all')

  const resourceTitleMap = computed(
    () => new Map(options.resources.value.map((item) => [item.id, item.title])),
  )

  /** 终止态不进总览列表：那是已经结束的接单，留在「我的接单」里查。 */
  function isOpenStatus(status: string): boolean {
    return status !== 'cancelled' && status !== 'rejected'
  }

  function matchesProjectTab(status: string): boolean {
    if (activeProjectTab.value === 'active') {
      return isActiveRequirement(status)
    }
    if (activeProjectTab.value === 'pending') {
      return status === 'pending_final'
    }
    if (activeProjectTab.value === 'completed') {
      return status === 'completed'
    }

    return true
  }

  function matchesDeliveryTab(versionCount: number): boolean {
    if (activeDeliveryTab.value === 'delivered') {
      return versionCount > 0
    }
    if (activeDeliveryTab.value === 'pending') {
      return versionCount === 0
    }

    return true
  }

  /** 全屏时不受 5 条 / 3 张的限制：看板上放得下多少就列多少，列表在区域内滚动。 */
  const projectRows = computed<DevHomeProjectRow[]>(() => {
    const board = options.liveBoard.value
    if (board) {
      // 快照已按「在途在前、同组按更新时间倒序」排好，保持后端顺序
      return board.projects
        .filter((item) => isOpenStatus(item.status) && matchesProjectTab(item.status))
        .map((item) => ({
          requirementId: item.requirement_id,
          title: item.title,
          status: item.status,
          statusLabel: requirementStatusLabel(item.status, item.payment_mode),
          tone: STATUS_TONES[item.status] ?? 'blue',
          createdAt: item.updated_at,
          updatedAt: item.updated_at,
          budget: item.budget ?? null,
          progress: requirementProgressPercent(item.status),
        }))
    }

    const sorted = options.requirements.value
      .filter((item) => isOpenStatus(item.status) && matchesProjectTab(item.status))
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))

    return (options.isFullscreen.value ? sorted : sorted.slice(0, OVERVIEW_LIST_LIMIT)).map(
      (item) => ({
        requirementId: item.requirement_id,
        title: item.title,
        status: item.status,
        statusLabel: requirementStatusLabel(item.status, item.payment_mode),
        tone: STATUS_TONES[item.status] ?? 'blue',
        createdAt: item.created_time,
        updatedAt: item.updated_at,
        budget: item.budget ?? null,
        progress: requirementProgressPercent(item.status),
      }),
    )
  })

  /** 交付 = 绑定资源项目的资源版本，所以最近交付按「已绑定资源的需求单」汇总。 */
  const deliveryRows = computed<DevHomeDeliveryRow[]>(() => {
    const board = options.liveBoard.value
    if (board) {
      return board.deliveries
        .filter((item) => matchesDeliveryTab(item.version_count))
        .map((item) => ({
          requirementId: item.requirement_id,
          requirementTitle: item.requirement_title,
          resourceTitle: item.resource_title || `资源 #${item.resource_id}`,
          versionCount: item.version_count,
          delivered: item.version_count > 0,
          updatedAt: item.last_delivered_at ?? '',
          amount: item.amount_cny,
        }))
    }

    const sorted = options.requirements.value
      .filter((item) => item.bound_resource_id != null)
      .filter((item) => matchesDeliveryTab(item.bound_resource_version_count ?? 0))
      .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))

    return (options.isFullscreen.value ? sorted : sorted.slice(0, DELIVERY_GRID_LIMIT)).flatMap(
      (item) => {
        const resourceId = item.bound_resource_id
        if (resourceId == null) {
          return []
        }

        const versionCount = item.bound_resource_version_count ?? 0

        return [
          {
            requirementId: item.requirement_id,
            requirementTitle: item.title,
            resourceTitle: resourceTitleMap.value.get(resourceId) ?? `资源 #${resourceId}`,
            versionCount,
            delivered: versionCount > 0,
            updatedAt: item.updated_at,
            amount: options.incomeByRequirement.value.get(item.requirement_id) ?? null,
          },
        ]
      },
    )
  })

  return {
    PROJECT_TABS,
    DELIVERY_TABS,
    activeProjectTab,
    activeDeliveryTab,
    projectRows,
    deliveryRows,
  }
}
