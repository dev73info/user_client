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
    path: '/payment/availability',
    note: '支付通道三态：mock 一律 ready，发布需求时才拦得到「渠道不可用」',
    handler: () => jsonResponse({ available: true, status: 'ready', status_label: '可用' }),
  },
  {
    method: 'GET',
    path: '/support/channels/public',
    note: '公开客服渠道：漏了它兜底回 []，客服挂件读 channels.find 会把整页打断',
    handler: () =>
      jsonResponse([{ channel_key: 'web_widget', label: '网页在线客服', enabled: true }]),
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
