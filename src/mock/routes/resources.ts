/**
 * 资源：开发者侧的「我的资源 / 版本管理」与门户公开的资源市场。
 *
 * 公开列表用的是同一批资源，只挑 `published` 的；下载接口返回一段占位内容，
 * 前端读流、写进度、触发保存这条链能完整跑一遍，不会卡在空的响应体上。
 *
 * 路由按子域分在 `resources/` 下（开发者侧 / 购买与退款 / 过户与转移 / 门户公开，
 * 外加共用的构造函数），本文件只按原顺序把它们拼成一张路由表：路径、note、处理逻辑都没动。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { devResourceRoutes } from './resources/devRoutes'
import { publicResourceRoutes } from './resources/publicRoutes'
import { purchaseRoutes } from './resources/purchaseRoutes'
import { transferRoutes } from './resources/transferRoutes'

const routes: MockRoute[] = [
  ...devResourceRoutes,
  ...purchaseRoutes,
  ...transferRoutes,
  ...publicResourceRoutes,
]

export const resourceRoutes = defineRouteTable('resources', routes)
