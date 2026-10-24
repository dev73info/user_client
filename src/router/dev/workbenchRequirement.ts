/**
 * 开发者工作台路由：需求大厅与「我的接单」。
 *
 * 路由表按域拆分（R047）后仍然只有这里新增条目；`path` / `name` / `meta` 与拆分前逐项一致，
 * 汇总顺序见同目录 `workbench.ts`（顺序影响 `getRoutes()` 的产出与匹配优先级，不能重排）。
 */
import type { RouteRecordRaw } from 'vue-router'

export const devWorkbenchRequirementRoutes: RouteRecordRaw[] = [
  {
    path: 'developer/requirements',
    redirect: { name: 'dev-requirement-hall' },
  },
  {
    path: 'developer/requirements/hall',
    name: 'dev-requirement-hall',
    component: () => import('@/views/DevRequirementHallView.vue'),
    meta: {
      title: '需求大厅 / 资源关联',
      description: '浏览可接需求并绑定开发资源。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements/hall/:requirementId',
    name: 'dev-requirement-detail',
    component: () => import('@/views/DevRequirementDetailView.vue'),
    meta: {
      title: '需求大厅 / 接取需求',
      description: '查看需求单详情并关联或初始化开发资源。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
  {
    path: 'developer/requirements/my',
    name: 'dev-my-requirements',
    component: () => import('@/views/DevMyRequirementsView.vue'),
    meta: {
      title: '需求大厅 / 我的需求单',
      description: '查看已关联需求的签署与操作、交付物与到账，以及沟通会话。',
      devArea: true,
      requiresDevAccess: true,
      requiresRealname: true,
    },
  },
]
