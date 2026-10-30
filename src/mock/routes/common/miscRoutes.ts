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
    path: '/teams',
    note: '我的团队（演示数据没有团队）',
    // 原来这条写成了 `/teams/teams`：别名表把 `/team/teams` 翻成 `/teams`，
    // 声明的 `/teams/teams` 归一化后是 `teams/teams`，和请求的 `teams` 永远对不上，
    // 于是它是一条死路由，团队下拉全靠兜底的 `[]`。
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/teams/invitations',
    note: '我的团队邀请（演示数据没有团队邀请）',
    handler: () => jsonResponse([]),
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
  {
    method: 'GET',
    path: '/payment/settlement-account',
    note: '我的收款账户：**没开户回 null，不是 404**',
    // 契约明写「还没开户是常态」。兜底给的是 `[]`，而 `[]` 在 JS 里是真值，
    // 适配层 `account ? toSnapshot(account) : null` 会把空数组当成账户对象，
    // 账户页就永远停在「正在自动开通收款账户，稍后刷新查看」——一个永远不会结束的等待。
    handler: () => jsonResponse(null),
  },
]
