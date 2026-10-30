/**
 * 积分域的变更动作：兑换、打赏、签到。
 *
 * 与 `db/points.ts`（数据 + 种子）分开，是因为这三个动作各有校验与连带写入，
 * 塞进数据文件会把「一份状态长什么样」和「状态怎么被改」搅在一起。
 * 校验结果统一用 `{ error, status }` 回给路由层，路由层只管把它翻成响应；
 * 校验与扣减写在同一处，中间不会插进一段只有路由才知道的代码。
 */

import type { PointsRedeemOrder, PointsTransfer } from '@/api/points'

import { currentMockProfile } from '../identity'
import { mallProducts, nowText, pointsState, pushLog, TRANSFER_META } from './points'

type ActionFailure = { error: string; status: number }

/** 兑换商品：扣积分、扣库存、写兑换记录，再按商品类型发权益或道具卡。 */
export function redeemProduct(
  productId: number | undefined,
): { order: PointsRedeemOrder } | ActionFailure {
  const state = pointsState()
  const username = currentMockProfile().username
  const product = mallProducts().find((item) => item.id === productId)

  if (!product) return { error: '商品不存在', status: 404 }
  if (product.stock <= 0) return { error: '商品已售罄', status: 409 }
  if (state.balance < product.points_cost) return { error: '积分不足', status: 409 }

  // 余额与库存一起动，避免「扣了分但没扣库存」这类只有 mock 下才出现的矛盾。
  pushLog(state, -product.points_cost, `兑换「${product.name}」`)
  product.stock -= 1

  const order: PointsRedeemOrder = {
    id: state.orders.length + 1,
    username,
    product_id: product.id,
    product_name: product.name,
    product_kind: product.kind,
    perk_code: product.perk_code,
    points_cost: product.points_cost,
    status: 'fulfilled',
    handle_note: null,
    handled_at: null,
    handled_by: 'system',
    created_at: nowText(),
  }
  state.orders.unshift(order)

  if (product.perk_code) {
    const owned = state.perks.find((perk) => perk.perk_code === product.perk_code)
    if (owned) {
      owned.owned = true
    } else {
      state.perks.push({
        perk_code: product.perk_code,
        owned: true,
        equipped: false,
        expires_at: null,
        created_at: order.created_at,
      })
    }
  } else {
    state.promoCards.unshift({
      id: state.promoCards.length + 1,
      card_code: product.name.includes('精选') ? 'resource_featured_card' : 'resource_pin_card',
      product_id: product.id,
      redeem_order_id: order.id,
      duration_days: product.duration_days,
      status: 'unused',
      created_at: order.created_at,
      used_at: null,
      used_resource_id: null,
    })
  }

  return { order }
}

/** 打赏：扣自己的积分，记一条已完成记录（mock 不走人工审核与每日限额）。 */
export function createTransfer(input: {
  to: string
  amount: number
  note?: string | null
}): { transfer: PointsTransfer } | ActionFailure {
  const state = pointsState()
  const username = currentMockProfile().username
  const to = input.to.trim()
  const amount = Number(input.amount ?? 0)

  if (!to) return { error: '接收方不能为空', status: 400 }
  if (!Number.isFinite(amount) || amount <= 0) return { error: '打赏金额必须大于 0', status: 400 }
  if (state.balance < amount) return { error: '积分不足', status: 409 }

  const fee = Math.floor((amount * TRANSFER_META.fee_rate) / 100)
  pushLog(state, -amount, `打赏给 ${to}`)

  const transfer: PointsTransfer = {
    id: state.transfers.length + 1,
    from_username: username,
    to_username: to,
    amount,
    fee,
    received: amount - fee,
    balance_after: state.balance,
    note: input.note?.trim() || null,
    status: 'completed',
    pending_review: false,
    cycle_flag: false,
    review_note: null,
    review_reason: null,
    reviewed_at: null,
    reviewed_by: null,
    created_at: nowText(),
  }
  state.transfers.unshift(transfer)

  return { transfer }
}

/** 签到：每天 5 积分；重复签到按后端口径回 `already_checked_in`，不再加积分。 */
export function performCheckin() {
  const state = pointsState()
  const username = currentMockProfile().username
  const already = state.checkedIn

  if (!already) {
    state.checkedIn = true
    state.streak += 1
    pushLog(state, 5, '每日签到')
  }

  return {
    username,
    already_checked_in: already,
    checkin_date: new Date().toISOString().slice(0, 10),
    points_awarded: already ? 0 : 5,
    streak_count: state.streak,
    streak_bonus: 0,
    week_bonus: 0,
    month_bonus: 0,
    total_awarded: already ? 0 : 5,
  }
}

/** 佩戴 / 卸下权益。后端同一时间只能戴一种用户名样式，所以颜色与渐变互斥。 */
export function equipPerk(perkCode: string, equipped: boolean) {
  const state = pointsState()
  const perk = state.perks.find((item) => item.perk_code === perkCode)

  if (!perk) return null

  perk.equipped = equipped
  return perk
}

/** 用户名展示样式：先全部置为未佩戴，再戴选中的那一个。 */
export function setUsernameAppearance(appearance: string, color: string | null) {
  const state = pointsState()
  const gradient = state.perks.find((perk) => perk.perk_code === 'username_gradient')
  const colorPerks = state.perks.filter((perk) => perk.perk_code.startsWith('username_color:'))

  for (const perk of [gradient, ...colorPerks]) {
    if (perk) perk.equipped = false
  }

  if (appearance === 'color') {
    const hex = (color ?? '').replace('#', '')
    const target = colorPerks.find((perk) => perk.perk_code === `username_color:${hex}`)
    if (!target) return null
    target.equipped = true
  } else if (gradient) {
    gradient.equipped = true
  }

  return {
    username: currentMockProfile().username,
    appearance: appearance === 'color' ? 'color' : 'gradient',
    color: appearance === 'color' ? color : null,
    username_gradient: appearance !== 'color',
    username_gradient_owned: Boolean(gradient?.owned),
  }
}
