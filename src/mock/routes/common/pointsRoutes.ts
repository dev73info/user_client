import type { MockRoute } from '../../router'

import { points } from '../../db'
import { jsonResponse } from '../../response'
import { currentUsername, nowText, pointsSelf } from './helpers'

export const pointsRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 积分 */
  {
    method: 'GET',
    path: '/points/me',
    note: '我的积分',
    handler: () => jsonResponse(pointsSelf()),
  },
  {
    method: 'GET',
    path: '/points/checkin/status',
    note: '签到状态（首页会拉这个接口）',
    handler: () => {
      const self = pointsSelf()

      return jsonResponse({
        username: self.username,
        today_checked_in: false,
        streak_count: 3,
        today_potential: 20,
      })
    },
  },
  {
    method: 'POST',
    path: '/points/checkin',
    note: '签到：加积分并返回奖励明细',
    handler: () => {
      points.balance += 20

      return jsonResponse({
        username: currentUsername(),
        checkin_date: nowText().slice(0, 10),
        streak_count: 4,
        points_awarded: 10,
        streak_bonus: 5,
        week_bonus: 5,
        month_bonus: 0,
        total_awarded: 20,
        already_checked_in: false,
      })
    },
  },
  {
    method: 'GET',
    path: '/points/mall/products',
    note: '积分商城商品：演示数据不给商品，避免兑换出假权益',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/points/mall/orders',
    note: '兑换记录',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/points/mall/gradient',
    note: '用户名渐变状态',
    handler: () => {
      const self = pointsSelf()

      return jsonResponse({
        username: self.username,
        username_gradient_owned: self.username_gradient_owned,
        username_gradient: self.username_gradient,
      })
    },
  },
  {
    method: 'POST',
    path: '/points/appearance/username',
    note: '设置用户名展示样式',
    handler: () => jsonResponse(pointsSelf()),
  },
  {
    method: 'GET',
    path: '/points/transfer/meta',
    note: '积分打赏规则',
    handler: () =>
      jsonResponse({
        fee_rate: 0.01,
        daily_cap: 5000,
        receive_daily_cap: 20000,
        new_user_cap: 500,
        new_user_min_days: 7,
      }),
  },
  {
    method: 'GET',
    path: '/points/transfers',
    note: '我的积分打赏记录',
    handler: () => jsonResponse([]),
  },
  {
    method: 'POST',
    path: '/points/transfer',
    note: '打赏积分',
    handler: () => jsonResponse({ transferred: true }),
  },
]
