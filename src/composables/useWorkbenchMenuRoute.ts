import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { overviewItem, type MenuRouteContext, type WorkbenchMenuItem } from '@/shared/workbenchMenu'
import { isMenuItemActive } from '@/shared/workbenchRoutes'

/**
 * 侧边栏各组件共用的「当前停在哪一条」判定。
 *
 * 无状态：只把 `useRoute()` 上与高亮有关的三项摊平成纯函数的入参，
 * 所以外壳、分组、消息中心各自调用都安全，不会出现两份互不同步的状态。
 */
export function useWorkbenchMenuRoute() {
  const route = useRoute()

  const routeContext = computed<MenuRouteContext>(() => ({
    name: String(route.name ?? ''),
    hash: route.hash,
    fromTeamResources: route.query.from === 'team-resources',
  }))

  function isItemActive(item: WorkbenchMenuItem) {
    return isMenuItemActive(item, routeContext.value)
  }

  function isOverviewActive() {
    return routeContext.value.name === overviewItem.name && !routeContext.value.hash
  }

  return { routeContext, isItemActive, isOverviewActive }
}
