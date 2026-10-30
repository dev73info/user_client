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
    path: '/ticket',
    note: '我的工单（演示数据没有工单；形状是裸数组，兜底的 [] 也对，这里只是让名字落到表里）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/dispute/cases',
    note: '我参与的争议案件（演示数据没有案件；契约是裸数组）',
    handler: () => jsonResponse([]),
  },
]
