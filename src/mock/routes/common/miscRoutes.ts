import type { MockRoute } from '../../router'

import { coupons } from '../../db'
import { jsonResponse } from '../../response'

export const miscRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 支付渠道与优惠券 */
  {
    method: 'GET',
    path: '/adapay/availability',
    note: '电签担保可用性：mock 一律可用，发布需求时能选到担保模式',
    handler: () => jsonResponse({ paymentReady: true, escrowBetaOnly: false, escrowAllowed: true }),
  },
  {
    method: 'GET',
    path: '/coupons/available',
    note: '我的可用优惠券',
    handler: () => jsonResponse(coupons),
  },
  {
    method: 'GET',
    path: '/teams/invitations',
    note: '我的团队邀请（演示数据没有团队邀请）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/teams/teams',
    note: '我的团队（演示数据没有团队）',
    handler: () => jsonResponse([]),
  },
]
