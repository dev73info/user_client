/**
 * 需求单：客户侧（我的需求、发布、取消、评论）与开发者侧（需求大厅、接单、我的接单）。
 *
 * 两侧读的是 `db.ts` 里的同一份数据，只是过滤条件不同：
 * 客户按 `creator` 过滤，开发者按 `developer` 过滤，需求大厅则是「还没人接的公开需求」。
 *
 * 路由与两侧的列表构造函数分在 `requirements/` 下，本文件只按原顺序把它们拼成一张路由表：
 * 路径、note、处理逻辑都没动。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { clientRequirementRoutes } from './requirements/clientRoutes'
import { dashboardRoutes } from './requirements/dashboardRoutes'
import { requirementDetailRoutes } from './requirements/detailRoutes'
import { devRequirementRoutes } from './requirements/devRoutes'

const routes: MockRoute[] = [
  ...clientRequirementRoutes,
  ...requirementDetailRoutes,
  ...devRequirementRoutes,
  ...dashboardRoutes,
]

export const requirementRoutes = defineRouteTable('requirements', routes)
