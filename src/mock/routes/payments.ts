/**
 * 支付：担保模式的定金 / 尾款下单与确认，以及开发者侧的接单保证金与提现。
 *
 * 下单 + 确认这条链在 mock 里是真会推进状态的：确认支付后需求单会从「待付定金」走到「已付定金」，
 * 尾款确认后走到「待结算」，所以四流的演示能一路走到底，而不是只换一个按钮文案。
 *
 * 爱签 / 支付宝 / 微信都不过第三方：mock 直接返回可用的占位结果（支付宝页面单给一段 HTML）。
 *
 * 路由与支付单构造函数分在 `payments/` 下，本文件只按原顺序把它们拼成一张路由表：
 * 路径、note、处理逻辑都没动。
 */

import { defineRouteTable, type MockRoute } from '../router'

import { devPaymentRoutes } from './payments/devRoutes'
import { paymentOrderRoutes } from './payments/orderRoutes'

const routes: MockRoute[] = [...paymentOrderRoutes, ...devPaymentRoutes]

export const paymentRoutes = defineRouteTable('payments', routes)
