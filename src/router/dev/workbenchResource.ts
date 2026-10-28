/**
 * 开发者工作台路由：资源管理（创建、列表、售出订单、主页与版本）。
 *
 * 创建页统一使用 dev-plugins；旧 dev-plugins-api 仅保留兼容重定向。
 * 汇总顺序见同目录 workbench.ts，顺序影响路由产出与匹配优先级。
 */
import type { LocationQueryRaw, RouteRecordRaw } from 'vue-router'

export const devWorkbenchResourceRoutes: RouteRecordRaw[] = [
  {
    path: 'developer/resources',
    redirect: { name: 'dev-plugins' },
  },
  {
    path: 'developer/resources/plugins-init',
    name: 'dev-plugins',
    component: () => import('@/views/DevResourceInitView.vue'),
    meta: {
      title: '创建资源',
      description: '创建免费、付费或接口资源并提交审核。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/plugins-init-api',
    name: 'dev-plugins-api',
    redirect: (to) => {
      const query: LocationQueryRaw = { ...to.query, type: 'api' }
      delete query.kind
      return { name: 'dev-plugins', query }
    },
  },
  {
    path: 'developer/resources/list',
    name: 'dev-resource-list',
    component: () => import('@/views/DevResourceListView.vue'),
    meta: {
      title: '资源管理 / 资源列表',
      description: '管理已创建资源、主页和版本。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    // 卖家侧「售出订单」：与买家侧「我的已购资源」（workbench-resource-purchases）是一件事的两面，
    // 故意取两个不会互相混淆的名字——那边是买进来的，这边是卖出去的。
    path: 'developer/resources/sold',
    name: 'dev-resource-sold-purchases',
    component: () => import('@/views/DevSoldResourcePurchasesView.vue'),
    meta: {
      title: '资源管理 / 售出订单',
      description: '查看卖出的付费资源订单并主动退款。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/:resourceId/homepage',
    name: 'dev-resource-homepage-edit',
    component: () => import('@/views/DevResourceHomepageEditView.vue'),
    meta: {
      title: '资源管理 / 编辑资源主页',
      description: '维护资源介绍、展示内容和发布信息。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/resources/:resourceId/versions',
    name: 'dev-resource-versions',
    component: () => import('@/views/DevResourceVersionsView.vue'),
    meta: {
      title: '资源管理 / 版本管理',
      description: '维护资源版本、文件和交付状态。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    // R010 打赏：开发者主页的变现设置（档位 / 通道 / 感谢语 / 公开记录）与「收到打赏」列表。
    path: 'developer/tips',
    name: 'dev-tip-settings',
    component: () => import('@/views/DevTipSettingsView.vue'),
    meta: {
      title: '打赏设置',
      description: '设置打赏档位、感谢语与公开记录，并查看收到打赏。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
]
