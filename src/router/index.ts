/**
 * 路由中心：history 模式选择、路由表装配与两道全局守卫的安装。
 *
 * 拆分（R047）后的分工：
 * - `router/routes/`：门户侧路由表按域拆开（`portal` / `workbench` / `misc` / `catalog`），
 *   `routes/index.ts` 按原顺序拼回；
 * - `router/dev/`：开发者侧路由表（`workbench*` / `legacy`）与它的守卫；
 * - `router/guard.ts`：门户侧全局守卫（SPA 兜底、主题、`?oauth_*`、登录与实名）。
 *
 * 对外面不变：仍然默认导出同一个 router 实例，`guard.ts` 里那道门户守卫与
 * `installDevRouteGuard` 的安装顺序也不变（门户在前、开发者在后）。
 */
import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'

import { installDevRouteGuard } from '@/router/dev'
import { installPortalRouteGuard } from '@/router/guard'
import { routes } from '@/router/routes'

const routerHistory =
  import.meta.env.VITE_ROUTER_MODE === 'history'
    ? createWebHistory(import.meta.env.BASE_URL)
    : createWebHashHistory(import.meta.env.BASE_URL)

const router = createRouter({
  history: routerHistory,
  routes,
})

installPortalRouteGuard(router)
installDevRouteGuard(router)

export default router
