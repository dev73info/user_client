import type { MockRouteTable } from '../router'

import { authRoutes } from './auth'
import { commonRoutes } from './common'
import { contractRoutes } from './contracts'
import { conversationRoutes } from './conversations'
import { invoiceRoutes } from './invoices'
import { paymentRoutes } from './payments'
import { requirementRoutes } from './requirements'
import { resourceRoutes } from './resources'

/**
 * mock 路由表，按注册顺序匹配，先注册的赢。
 *
 * 顺序上先放「路径更具体」的表：需求、合同、支付、资源的路径都带自己的前缀，
 * 互相不重叠；auth 放在最后也不会被抢走 `/auth/...`。
 * 新增一个域就在这里挂一张表；路径写法与 src/api 里一致即可（别名由 router 统一处理）。
 */
export const mockRouteTables: readonly MockRouteTable[] = [
  requirementRoutes,
  contractRoutes,
  paymentRoutes,
  invoiceRoutes,
  resourceRoutes,
  conversationRoutes,
  commonRoutes,
  authRoutes,
]
