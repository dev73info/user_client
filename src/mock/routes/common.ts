/**
 * 通用页面的接口：账号设置、实名认证、优惠券、支付渠道可用性。
 *
 * 这一域的假数据刻意做「保守但可用」：实名认证与开发者资格一律返回已通过，
 * 否则每进一个需要实名的页面都会被路由守卫弹走，mock 就没法用来预览页面了；
 * 第三方能力（爱签、微信扫码）返回占位结果，不假装真的接通了外部服务。
 *
 * 路由按子域分在 `common/` 下（账号设置 / 实名认证 / 收款账户 / 打赏 / 接入客户端 /
 * 支付与优惠券，外加共用的假数据构造函数），本文件只按原顺序把它们拼成一张路由表：
 * 路径、note、处理逻辑都没动。
 * 社区 mock 在独立的 community 路由表中，与当前后端契约同步。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { accountRoutes } from './common/accountRoutes'
import { miscRoutes } from './common/miscRoutes'
import { oauthClientRoutes } from './common/oauthClientRoutes'
import { realnameRoutes } from './common/realnameRoutes'
import { settlementRoutes } from './common/settlementRoutes'
import { shareRoutes } from './common/shareRoutes'
import { tipRoutes } from './common/tipRoutes'

const routes: MockRoute[] = [
  ...accountRoutes,
  ...realnameRoutes,
  ...settlementRoutes,
  ...tipRoutes,
  ...oauthClientRoutes,
  ...shareRoutes,
  ...miscRoutes,
]

export const commonRoutes = defineRouteTable('common', routes)
