/**
 * 旧版 `/dev/*` 地址：全部只做重定向，落到开发者工作台里的正式条目。
 *
 * 这些路径不进工作台（不是 `developer/*` 子路由），所以在根路由表里平铺；`redirect` 的取值形态
 * （字面量 / `redirectToDevWorkbench(...)`）与拆分前一致——后者会把 params / query / hash 透传下去。
 */
import type { RouteLocationRaw, RouteRecordRaw } from 'vue-router'

export function redirectToDevWorkbench(
  name: string,
): (to: { params: unknown; query: unknown; hash: string }) => RouteLocationRaw {
  return (to) => ({
    name,
    params: to.params as Record<string, string | string[]>,
    query: to.query as Record<string, string | string[]>,
    hash: to.hash,
  })
}

export const devLegacyRoutes: RouteRecordRaw[] = [
  {
    path: '/dev',
    redirect: { name: 'dev-plugins' },
  },
  {
    path: '/dev/overview',
    redirect: { name: 'dev-plugins' },
  },
  {
    path: '/dev/wallet',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    path: '/dev/wallet/order-deposit',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    path: '/dev/wallet/overview',
    redirect: redirectToDevWorkbench('dev-wallet'),
  },
  {
    // 交付记录已并入「我的接单」，老链接直接落到那里。
    path: '/dev/wallet/releases',
    redirect: redirectToDevWorkbench('dev-my-requirements'),
  },
  {
    path: '/dev/wallet/withdrawals',
    redirect: redirectToDevWorkbench('dev-wallet-withdrawals'),
  },
  {
    path: '/dev/resources',
    redirect: redirectToDevWorkbench('dev-plugins'),
  },
  {
    path: '/dev/resources/plugins-init',
    redirect: redirectToDevWorkbench('dev-plugins'),
  },
  {
    path: '/dev/resources/list',
    redirect: redirectToDevWorkbench('dev-resource-list'),
  },
  {
    path: '/dev/resources/:resourceId/homepage',
    redirect: redirectToDevWorkbench('dev-resource-homepage-edit'),
  },
  {
    path: '/dev/resources/:resourceId/versions',
    redirect: redirectToDevWorkbench('dev-resource-versions'),
  },
  {
    path: '/dev/tips',
    redirect: redirectToDevWorkbench('dev-tip-settings'),
  },
  {
    path: '/dev/requirements',
    redirect: redirectToDevWorkbench('dev-requirement-hall'),
  },
  {
    path: '/dev/requirements/hall',
    redirect: redirectToDevWorkbench('dev-requirement-hall'),
  },
  {
    path: '/dev/requirements/hall/:requirementId',
    redirect: redirectToDevWorkbench('dev-requirement-detail'),
  },
  {
    path: '/dev/requirements/my',
    redirect: redirectToDevWorkbench('dev-my-requirements'),
  },
  {
    path: '/dev/realname',
    redirect: redirectToDevWorkbench('workbench-realname'),
  },
  {
    path: '/dev/login',
    redirect: { name: 'dev-plugins' },
  },
  {
    path: '/dev/developer-agreement',
    name: 'developer-agreement',
    component: () => import('@/views/DeveloperAgreementView.vue'),
    meta: {
      title: '开发者入驻协议',
    },
  },
  {
    path: '/dev/no-access',
    redirect: redirectToDevWorkbench('dev-no-access'),
  },
]
