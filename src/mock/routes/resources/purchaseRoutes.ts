import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'
import type { MockRoute } from '../../router'

import { mcResources } from '../../db'
import { currentMockProfile } from '../../identity'
import { jsonResponse, readInt, readString, textResponse } from '../../response'
import { findPaidEntitlement, mockBuyer, mockPurchases, nowIso } from './helpers'

let nextPurchaseSeq = 1

export const purchaseRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 购买 / 退款 */
  {
    method: 'POST',
    path: '/dev/resources/resources/:resourceId/purchase',
    note: '资源购买下单（mock 直接记为已支付）',
    handler: (request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }
      const requestBody = (request.body ?? {}) as { pay_channel?: string; promo_code?: string }
      const payChannel = String(requestBody.pay_channel ?? 'alipay')
      // R029：mock 只把推广码原样留痕，不做归因（归因与分账是后端的事，mock 不假装算得出来）
      const promoCode = typeof requestBody.promo_code === 'string' ? requestBody.promo_code : null
      const pricePoints = resource.price_points ?? 0
      const priceFen = resource.price_fen ?? 0
      if (payChannel === 'points') {
        if (pricePoints <= 0) {
          return textResponse('该资源未设置积分售价', 409)
        }
      } else if (priceFen <= 0) {
        return textResponse('该资源为免费资源，无需购买', 409)
      }
      const buyer = mockBuyer()
      const existing = findPaidEntitlement(buyer, resource.id)
      if (existing) {
        return textResponse(`已购买该资源（订单 ${existing.order_no}），可直接下载`, 409)
      }
      const orderNo = `MOCK-RPO-${nextPurchaseSeq++}`
      const stamp = nowIso()
      const isPoints = payChannel === 'points'
      const amountPoints = isPoints ? pricePoints : 0
      const feePoints = isPoints ? Math.round(amountPoints * 0.1) : 0
      const amountFen = isPoints ? 0 : priceFen
      const feeFen = isPoints ? 0 : Math.round(amountFen * 0.1)
      const order: ResourcePurchaseOrder = {
        order_no: orderNo,
        buyer,
        resource_id: resource.id,
        resource_title: resource.title,
        seller: resource.creator,
        amount_fen: amountFen,
        platform_fee_fen: feeFen,
        seller_net_fen: amountFen - feeFen,
        platform_fee_bps: 1000,
        amount_points: amountPoints,
        platform_fee_points: feePoints,
        seller_net_points: amountPoints - feePoints,
        status: 'paid',
        pay_channel: payChannel,
        provider_payment_id: isPoints ? null : `SIM_${orderNo}`,
        provider_confirm_id: null,
        pay_url: null,
        split_status: 'succeeded',
        first_downloaded_at: null,
        paid_at: stamp,
        refunded_at: null,
        created_at: stamp,
        updated_at: stamp,
        refunded_amount_fen: 0,
        refundable_amount_fen: amountFen,
        within_refund_window: true,
        entitlement_revoked: false,
        refund_reason: null,
        refund_initiator: null,
        refund_operator: null,
        last_refund_at: null,
        // R029：推广分成只在后端归因（mock 不模拟），这里只留痕下单带来的推广码
        promoter: null,
        promo_code: isPoints ? null : promoCode,
        promo_share_bps: isPoints ? 0 : Number(resource.promo_share_bps ?? 0),
        promoter_fee_fen: 0,
        promoter_split_status: 'none',
        promo_reject_reason: null,
      }
      mockPurchases.unshift(order)
      return jsonResponse(order)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/purchases/sold',
    note: '卖家售出订单（仅本人售出）',
    handler: (request) => {
      const seller = currentMockProfile().username
      const status = request.query.get('status')?.trim() ?? ''
      return jsonResponse(
        mockPurchases.filter(
          (item) => item.seller === seller && (!status || item.status === status),
        ),
      )
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/purchases/sold/:orderNo',
    note: '卖家售出订单详情（仅本人售出）',
    handler: (_request, params) => {
      const seller = currentMockProfile().username
      const order = mockPurchases.find(
        (item) => item.order_no === params.orderNo && item.seller === seller,
      )
      return order ? jsonResponse(order) : textResponse('订单不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/dev/resources/purchases/:orderNo/seller-refund',
    note: '卖家主动退款（全额 / 部分）',
    handler: (request, params) => {
      const order = mockPurchases.find((item) => item.order_no === params.orderNo)
      if (!order) {
        return textResponse('订单不存在', 404)
      }
      const reason = String((request.body as { reason?: string } | null)?.reason ?? '').trim()
      if (!reason) {
        return textResponse('退款原因必填', 400)
      }
      if (order.amount_points > 0) {
        return textResponse('积分支付订单不支持主动退款', 409)
      }
      if (order.status !== 'paid') {
        return textResponse('仅已支付且未退款的订单可退款', 409)
      }
      if (order.refundable_amount_fen <= 0) {
        return textResponse('该订单已无可退余额', 409)
      }
      const requested = (request.body as { amount_fen?: number } | null)?.amount_fen
      const amountFen = requested ?? order.refundable_amount_fen
      if (
        !Number.isFinite(amountFen) ||
        amountFen <= 0 ||
        amountFen > order.refundable_amount_fen
      ) {
        return textResponse('退款金额必须大于 0 且不超过可退余额', 400)
      }
      const stamp = nowIso()
      order.refunded_amount_fen += amountFen
      order.refundable_amount_fen = Math.max(order.amount_fen - order.refunded_amount_fen, 0)
      order.entitlement_revoked = true
      order.refund_reason = reason
      order.refund_initiator = 'seller'
      order.refund_operator = currentMockProfile().username
      order.last_refund_at = stamp
      if (order.refundable_amount_fen <= 0) {
        order.status = 'refunded'
        order.refunded_at = stamp
      }
      order.updated_at = stamp
      return jsonResponse(order)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/purchases/mine',
    note: '我的资源购买订单（支持 status / keyword 筛选与 limit+offset 分页，总数走 X-Total-Count）',
    handler: (request) => {
      const buyer = mockBuyer()
      const status = readString(request.query, 'status')
      const keyword = readString(request.query, 'keyword').toLowerCase()
      let rows = mockPurchases.filter((item) => item.buyer === buyer)
      if (status) {
        rows = rows.filter((item) => item.status === status)
      }
      if (keyword) {
        rows = rows.filter(
          (item) =>
            item.order_no.toLowerCase().includes(keyword) ||
            (item.resource_title ?? '').toLowerCase().includes(keyword),
        )
      }
      const limit = Math.min(Math.max(readInt(request.query, 'limit', 50), 1), 100)
      const offset = Math.max(readInt(request.query, 'offset', 0), 0)
      return jsonResponse(rows.slice(offset, offset + limit), 200, {
        'X-Total-Count': String(rows.length),
      })
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/purchases/:orderNo',
    note: '我的资源购买订单详情',
    handler: (_request, params) => {
      const order = mockPurchases.find((item) => item.order_no === params.orderNo)
      return order ? jsonResponse(order) : textResponse('订单不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/dev/resources/purchases/:orderNo/refund',
    note: '买家入口已按需求 Q9 关闭：恒 403',
    handler: () =>
      textResponse('退款仅限卖家或平台发起，买家不可自助退款；如需退款请联系卖家或客服', 403),
  },
]
