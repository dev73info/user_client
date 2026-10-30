/**
 * 积分域接口：我的积分、商城、兑换、权益佩戴、道具卡、打赏与签到。
 *
 * 数据在 `db/points.ts`（一份状态 + 种子），变更在 `db/pointsActions.ts`（校验 + 扣减）。
 * 这里只做「读当前身份的那份 / 调一个动作 / 翻成响应」，所以兑换完余额会真的少、
 * 记录会真的多，页面不会出现「提示兑换成功但数字没动」的假象。
 *
 * 刻意不实现：打赏的每日限额与人工审核（mock 一律直接完成）、道具卡核销（卡只在背包里显示）。
 * 这些规则要验就在真后端验，mock 不假装能验。
 */

import { checkinStatus, mallProducts, pointsState, TRANSFER_META } from '../db/points'
import {
  createTransfer,
  equipPerk,
  performCheckin,
  redeemProduct,
  setUsernameAppearance,
} from '../db/pointsActions'
import { currentMockProfile } from '../identity'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, readInt, readString, textResponse } from '../response'

const routes: MockRoute[] = [
  /* ---------------------------------------------------------------- 我的积分 */
  {
    method: 'GET',
    path: '/points/me',
    note: '我的积分总览：余额 + 权益 + 分页的明细',
    handler: (request) => {
      const state = pointsState()
      // 与后端同口径：按页切片，`logs_total` 给总数，页面据此算页数。
      const page = readInt(request.query, 'page', 1)
      const pageSize = readInt(request.query, 'page_size', 10)
      const start = Math.max(0, (page - 1) * pageSize)
      const hasPerk = (code: string, field: 'owned' | 'equipped') =>
        state.perks.some((perk) => perk.perk_code === code && perk[field])

      return jsonResponse({
        username: currentMockProfile().username,
        points_balance: state.balance,
        perks: state.perks,
        logs: state.logs.slice(start, start + pageSize),
        logs_page: page,
        logs_page_size: pageSize,
        logs_total: state.logs.length,
        username_gradient: hasPerk('username_gradient', 'equipped'),
        username_gradient_owned: hasPerk('username_gradient', 'owned'),
      })
    },
  },
  {
    method: 'POST',
    path: '/points/perks/:perkCode',
    note: '佩戴 / 卸下权益',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { equipped?: boolean }
      const perk = equipPerk(params.perkCode ?? '', Boolean(body.equipped))
      return perk ? jsonResponse(perk) : textResponse('权益不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/points/appearance/username',
    note: '用户名展示样式（渐变 / 特定颜色）',
    handler: (request) => {
      const body = (request.body ?? {}) as { appearance?: string; color?: string | null }
      const result = setUsernameAppearance(body.appearance ?? 'gradient', body.color ?? null)
      return result ? jsonResponse(result) : textResponse('没有这个颜色的权益', 400)
    },
  },

  /* ---------------------------------------------------------------- 积分商城 */
  {
    method: 'GET',
    path: '/points/mall/products',
    note: '商城商品列表',
    handler: () => jsonResponse(mallProducts()),
  },
  {
    method: 'GET',
    path: '/points/mall/orders',
    note: '我的兑换记录',
    handler: () => jsonResponse(pointsState().orders),
  },
  {
    method: 'POST',
    path: '/points/mall/redeem',
    note: '兑换商品：扣积分、加权益 / 道具卡、记一条兑换记录',
    handler: (request) => {
      const body = (request.body ?? {}) as { product_id?: number }
      const result = redeemProduct(body.product_id)
      return 'error' in result
        ? textResponse(result.error, result.status)
        : jsonResponse(result.order)
    },
  },
  {
    method: 'GET',
    path: '/points/promo-cards',
    note: '我的道具卡：按 status 过滤，默认只给未使用的',
    handler: (request) => {
      const status = readString(request.query, 'status') || 'unused'
      return jsonResponse(pointsState().promoCards.filter((card) => card.status === status))
    },
  },
  {
    method: 'GET',
    path: '/points/resource-promo-meta',
    note: '资源推广配置（精选门槛）',
    handler: () => jsonResponse({ high_like_threshold: 50 }),
  },

  /* ---------------------------------------------------------------- 打赏 */
  {
    method: 'GET',
    path: '/points/transfer/meta',
    note: '打赏规则',
    handler: () => jsonResponse(TRANSFER_META),
  },
  {
    method: 'GET',
    path: '/points/transfers',
    note: '我的打赏记录',
    handler: () => jsonResponse(pointsState().transfers),
  },
  {
    method: 'POST',
    path: '/points/transfer',
    note: '打赏：扣自己的积分，记一条已完成记录（mock 不走人工审核）',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        to_username?: string
        amount?: number
        note?: string | null
      }
      const result = createTransfer({
        to: body.to_username ?? '',
        amount: Number(body.amount ?? 0),
        note: body.note,
      })
      return 'error' in result
        ? textResponse(result.error, result.status)
        : jsonResponse(result.transfer)
    },
  },

  /* ---------------------------------------------------------------- 签到 */
  {
    method: 'GET',
    path: '/points/checkin/status',
    note: '今日签到状态',
    handler: () => jsonResponse(checkinStatus()),
  },
  {
    method: 'POST',
    path: '/points/checkin',
    note: '签到：每天给 5 积分，重复签到按后端口径返回 already_checked_in',
    handler: () => jsonResponse(performCheckin()),
  },
]

export const pointsRoutes = defineRouteTable('points', routes)
