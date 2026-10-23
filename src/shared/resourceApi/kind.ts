/** 资源类别判定与列表动作可用性（ 的类别分支）。 */

/** 资源类别：`normal` = 大厅公开展示（默认）；`api` = 不在公开面展示，只能由指定来源下单。 */
export type McResourceKindLike = 'normal' | 'api'

/** 单条来源的三种合法形态：完整源、通配域名、纯 IP。 */
export function isApiResourceKind(kind: string | null | undefined): boolean {
  return (kind ?? '').trim().toLowerCase() === 'api'
}

/** 资源类别的中文名（列表标记与表单选项共用）。 */
export function resourceKindLabel(kind: string | null | undefined): string {
  return isApiResourceKind(kind) ? '接口资源' : '普通资源'
}

/** 资源列表「更多」菜单里的动作码（与 `DevResourceListView` 的 `handleResourceCommand` 同一套）。 */
export type ResourceRowAction =
  | 'publish'
  | 'request-review'
  | 'set-private'
  | 'use-promo'
  | 'versions'
  | 'sold-orders'
  | 'transfer'
  | 'delete'

/**
 * 接口资源上用不上的动作：
 * - `publish` / `versions`：接口资源没有可下载文件（`source_url` 是 `pending://resource/api/...` 占位），
 *   版本发布与版本管理对它是一步死操作；
 * - `use-promo`：精选 / 置顶卡只作用于大厅与首页精选，而接口资源不进任何公开面，
 *   用下去卡会被标记已使用、资源却哪都不出现；
 * - `transfer`：渠道配置（回调地址 / 密钥 / 允许来源）按 resource_id 存放、不随归属变化，
 *   过户等于把「回调打到旧开发者服务器」的配置一并交给新主人。
 *
 * 「申请公开」「设为私有」「售出订单」「删除」对接口资源照常成立，不在此列。
 */
export const API_RESOURCE_UNAVAILABLE_ACTIONS: readonly ResourceRowAction[] = [
  'publish',
  'versions',
  'use-promo',
  'transfer',
]

/** 列表「更多」菜单里这个动作对当前资源是否可用：普通资源全开，接口资源藏掉上面那几项。 */
export function isResourceRowActionAvailable(
  action: ResourceRowAction,
  kind: string | null | undefined,
): boolean {
  return !isApiResourceKind(kind) || !API_RESOURCE_UNAVAILABLE_ACTIONS.includes(action)
}

/**
 * 路由 query 里的资源类别：只有 `api` 算接口资源（去首尾空白、忽略大小写），
 * 其余——空值、数组（`?kind=a&kind=b`）、数字、不认识的值——一律按普通资源处理。
 */
export function resourceKindFromQuery(value: unknown): McResourceKindLike {
  return isApiResourceKind(typeof value === 'string' ? value : null) ? 'api' : 'normal'
}
