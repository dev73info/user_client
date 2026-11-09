/**
 * 资源管理页所在的工作台：开发者「资源项目」与需求方「我的资源」共用同一批
 * 资源详情 / 主页编辑 / 版本管理组件，但回跳落点与可用的行操作不同。
 *
 * 路由上用 `meta.resourceWorkspace = 'mine'` 标记需求方那一套；缺省按开发者处理，
 * 既有开发者路由一条都不用改。
 */
import type { RouteMeta } from 'vue-router'

export type ResourceWorkspace = 'dev' | 'mine'

/** 读路由 meta：只有显式标了 `mine` 才算需求方工作台，其余一律按开发者。 */
export function resourceWorkspaceOfMeta(meta: RouteMeta | undefined): ResourceWorkspace {
  return meta?.resourceWorkspace === 'mine' ? 'mine' : 'dev'
}

/** 资源列表页的路由名：出错 / 返回时回到自己那一套列表。 */
export function resourceWorkspaceListRouteName(meta: RouteMeta | undefined): string {
  return resourceWorkspaceOfMeta(meta) === 'mine' ? 'workbench-resources' : 'dev-resource-list'
}

/** 行操作要跳的路由名；需求方工作台没有「售出订单」入口。 */
export function resourceWorkspaceRouteNames(meta: RouteMeta | undefined): {
  editHomepage: string
  versions: string
  soldPurchases: string | null
} {
  if (resourceWorkspaceOfMeta(meta) === 'mine') {
    return {
      editHomepage: 'workbench-resource-homepage-edit',
      versions: 'workbench-resource-versions',
      soldPurchases: null,
    }
  }
  return {
    editHomepage: 'dev-resource-homepage-edit',
    versions: 'dev-resource-versions',
    soldPurchases: 'dev-resource-sold-purchases',
  }
}
