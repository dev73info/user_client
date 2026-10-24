/**
 * 门户路由表的总入口（barrel）：按域把各模块拼回原 `index.ts` 的那一条 `routes` 数组。
 *
 * 拆分（R047）后各模块只声明自己的条目，**拼接顺序与拆分前逐条一致**：
 * `devRoutes`（旧版 `/dev/*`）→ 门户主路由 → `/workbench` 工作台 → 门户独立页面 →
 * 资源目录 / 详情地址族与兜底路由。顺序影响 `getRoutes()` 的产出与匹配优先级（尤其兜底路由
 * 必须留在最后），不要按字母重排。
 */
import type { RouteRecordRaw } from 'vue-router'

import { devRoutes } from '@/router/dev'
import { resourceCatalogRoutes } from '@/router/routes/catalog'
import { portalMiscRoutes } from '@/router/routes/misc'
import { portalRoutes } from '@/router/routes/portal'
import { workbenchRoutes } from '@/router/routes/workbench'

export const routes: RouteRecordRaw[] = [
  ...devRoutes,
  ...portalRoutes,
  ...workbenchRoutes,
  ...portalMiscRoutes,
  ...resourceCatalogRoutes,
]
