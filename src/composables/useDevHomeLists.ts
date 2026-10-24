import { computed, ref, type Ref } from 'vue'

import type { RequirementItem } from '@/api/devRequirements'
import type { McResourcePayload } from '@/api/mcResources'
import type { useDevHomeDashboard } from './useDevHomeDashboard'
import {
  STATUS_TONES,
  requirementTimeText,
  resourceVisibilityView,
  type DevHomeProjectRow,
  type DevHomeResourceRow,
} from '@/shared/devHomeDisplay'
import {
  isActiveRequirement,
  requirementProgressPercent,
  requirementStatusLabel,
} from '@/shared/requirementStatus'
import { formatBackendDateTime } from '@/shared/datetime'

/** 总览页只做汇总：需求与资源各最多展示 5 条，完整明细留在各自的菜单页。 */
const OVERVIEW_LIST_LIMIT = 5

type ProjectTabKey = 'all' | 'active' | 'completed'

const PROJECT_TABS: ReadonlyArray<{ key: ProjectTabKey; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'completed', label: '已完成' },
]

type DashboardState = ReturnType<typeof useDevHomeDashboard>

export type DevHomeListsOptions = {
  requirements: DashboardState['requirements']
  resources: DashboardState['resources']
}

/**
 * 开发者总览页两张列表卡的行：我的需求与我的资源。组件（`DevProjectList` / 视图里的资源卡）
 * 只画，口径都在这里：
 * - 终止态（`cancelled` / `rejected`）不进总览列表，留在「我的接单」里查；
 * - 排序用**契约字段**：优先接单时间 `developer_bound_at`，没有退到 `created_time`。
 *   两者都是定长的东八区串，字典序即时间序，不解析成 `Date`；
 * - 资源状态取 `visibility` 的三个取值，别把「草稿」画成「已发布」。
 */
export function useDevHomeLists(options: DevHomeListsOptions) {
  const activeProjectTab = ref<ProjectTabKey>('all')

  /** 终止态不进总览列表：那是已经结束的接单，留在「我的接单」里查。 */
  function isOpenStatus(status: string): boolean {
    return status !== 'cancelled' && status !== 'rejected'
  }

  function matchesProjectTab(status: string): boolean {
    if (activeProjectTab.value === 'active') {
      return isActiveRequirement(status)
    }
    if (activeProjectTab.value === 'completed') {
      return status === 'completed'
    }

    return true
  }

  /** 时间列的排序键：契约里没有 `updated_at`，不许拿它排。 */
  function sortKey(item: RequirementItem): string {
    return item.developer_bound_at ?? item.created_time
  }

  const projectRows = computed<DevHomeProjectRow[]>(() =>
    options.requirements.value
      .filter((item) => isOpenStatus(item.status) && matchesProjectTab(item.status))
      .sort((left, right) => sortKey(right).localeCompare(sortKey(left)))
      .slice(0, OVERVIEW_LIST_LIMIT)
      .map((item) => ({
        requirementId: item.requirement_id,
        title: item.title,
        status: item.status,
        statusLabel: requirementStatusLabel(item.status, item.payment_mode),
        tone: STATUS_TONES[item.status] ?? 'blue',
        timeText: requirementTimeText(item.developer_bound_at, item.created_time),
        budget: item.budget ?? null,
        progress: requirementProgressPercent(item.status),
      })),
  )

  const resourceRows = computed<DevHomeResourceRow[]>(() =>
    [...options.resources.value]
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
      .slice(0, OVERVIEW_LIST_LIMIT)
      .map((item) => {
        const visibility = resourceVisibilityView(item.visibility)

        return {
          id: item.id,
          title: item.title,
          platform: item.platform,
          visibilityLabel: visibility.label,
          tone: visibility.tone,
          timeText: formatBackendDateTime(item.updated_at),
        }
      }),
  )

  return { PROJECT_TABS, activeProjectTab, projectRows, resourceRows }
}
