/**
 * 开发者工作台路由的总入口（barrel）。
 *
 * 路由表按域拆在 `dev/` 下：`workbenchAccount`（账号 / 钱包 / 发票）、`workbenchResource`
 * （资源创建与管理）、`workbenchRequirement`（需求大厅与我的接单）、`workbenchShared`
 * （团队 / 消息 / 通知 / 权限兜底页）、`legacy`（旧版 `/dev/*` 重定向）、
 * `guard`（全局前置守卫）。
 *
 * 对外面不变：仍然导出 `devRoutes`、`devWorkbenchRoutes`、`installDevRouteGuard` 三个名字，
 * 内容与顺序都与拆分前逐项一致（`devWorkbenchRoutes` 的顺序决定 `getRoutes()` 产出与匹配优先级，
 * 不要按字母重排）。
 */
import type { RouteRecordRaw } from 'vue-router'

import { installDevRouteGuard } from '@/router/dev/guard'
import { devLegacyRoutes } from '@/router/dev/legacy'
import { devWorkbenchAccountRoutes } from '@/router/dev/workbenchAccount'
import { devWorkbenchRequirementRoutes } from '@/router/dev/workbenchRequirement'
import { devWorkbenchResourceRoutes } from '@/router/dev/workbenchResource'
import { devWorkbenchSharedRoutes } from '@/router/dev/workbenchShared'

export { installDevRouteGuard }

/** 挂在 `/workbench` 子路由下的开发者条目。 */
export const devWorkbenchRoutes: RouteRecordRaw[] = [
  ...devWorkbenchAccountRoutes,
  ...devWorkbenchResourceRoutes,
  ...devWorkbenchRequirementRoutes,
  ...devWorkbenchSharedRoutes,
]

/** 根路由表里平铺的旧版 `/dev/*` 入口与开发者入驻协议页。 */
export const devRoutes: RouteRecordRaw[] = devLegacyRoutes
