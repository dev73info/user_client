import type { MockRoute } from '../../router'

import { mcResources, versionsOf } from '../../db'
import { currentMockProfile } from '../../identity'
import { jsonResponse, readInt, readString, textResponse } from '../../response'
import {
  findPaidEntitlement,
  mockBuyer,
  mockPurchases,
  nowIso,
  type MockResourcePurchaseOrder,
} from './helpers'

let nextPurchaseSeq = 1

export const purchaseRoutes: MockRoute[] = [
  /* ---------------------------------------------------------------- 购买 / 退款
   *
   * 路径一律用契约的**单数** `/resource/...`：`/dev/resources` 会被别名翻成复数 `/resources`，
   * 而购买这一族在后端是 `/api/resource/...`（actix 逐字匹配，复数路径 404）。
   * 原来这里全写成 `/dev/resources/purchases/...`，归一化后与前端请求的
   * `/resource/purchases/...` 差一个字母，整族路由一条都匹配不上——
   * 「我的已购」永远是「还没有购买记录」，卖家「售出订单」永远是空表。
   */
  {
    method: 'GET',
    path: '/resource/sale/fee',
    note: '资源售卖平台抽成比例（发布页费用披露用，只回基点）',
    handler: () => jsonResponse({ platform_fee_bps: 1000 }),
  },
  {
    method: 'POST',
    path: '/resource/resources/:resourceId/purchase',
    note: '资源购买下单（mock 直接记为已支付）',
    handler: (request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }
      const requestBody = (request.body ?? {}) as {
        pay_channel?: string
        promo_code?: string
        version_id?: number | null
      }
      const payChannel = String(requestBody.pay_channel ?? 'alipay')
      // R029：mock 只把推广码原样留痕，不做归因（归因与分账是后端的事，mock 不假装算得出来）
      const promoCode = typeof requestBody.promo_code === 'string' ? requestBody.promo_code : null
      const pricePoints = resource.price_points ?? 0
      const priceFen = resource.price_fen ?? 0
      if (payChannel === 'points') {
        // 与后端一致：积分购只支持平台内买断，不能按版本下单
        if (requestBody.version_id != null) {
          return textResponse('积分购买仅支持平台内买断', 409)
        }
        if (pricePoints <= 0) {
          return textResponse('该资源未设置积分售价', 409)
        }
      }

      // 版本购买：按 `version_id` 取版本价；0 价版本不单卖。
      let versionId: number | null = null
      let versionPriceFen: number | null = null
      if (requestBody.version_id != null) {
        const parsedVersionId = Number(requestBody.version_id)
        const version = Number.isInteger(parsedVersionId)
          ? versionsOf(resource.id).find((item) => item.id === parsedVersionId)
          : undefined
        if (!version) {
          return textResponse('版本不存在', 404)
        }
        if ((version.price_fen ?? 0) <= 0) {
          return textResponse('该版本不可单独购买，请购买整包', 409)
        }
        versionId = version.id
        versionPriceFen = version.price_fen
      } else if (payChannel !== 'points' && priceFen <= 0) {
        return textResponse('该资源为免费资源，无需购买', 409)
      }

      const buyer = mockBuyer()
      // 买断权益覆盖全部版本，所以买版本时也要查一次买断单。
      const existingBuyout = findPaidEntitlement(buyer, resource.id)
      if (existingBuyout) {
        return textResponse(`已购买该资源（订单 ${existingBuyout.order_no}），可直接下载`, 409)
      }
      if (versionId != null) {
        const existingVersion = findPaidEntitlement(buyer, resource.id, versionId)
        if (existingVersion) {
          return textResponse(`已购买该版本（订单 ${existingVersion.order_no}），可直接下载`, 409)
        }
      }
      const orderNo = `MOCK-RPO-${nextPurchaseSeq++}`
      const stamp = nowIso()
      const isPoints = payChannel === 'points'
      const amountPoints = isPoints ? pricePoints : 0
      const feePoints = isPoints ? Math.round(amountPoints * 0.1) : 0
      const amountFen = isPoints ? 0 : (versionPriceFen ?? priceFen)
      const feeFen = isPoints ? 0 : Math.round(amountFen * 0.1)
      const order: MockResourcePurchaseOrder = {
        order_no: orderNo,
        buyer,
        source_kind: 'platform',
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
        api_callback_attempts: 0,
        api_callback_status: 'none',
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
        // 买断单不写 version_id（覆盖全部版本）；单版本单只覆盖同一版本。
        ...(versionId != null ? { version_id: versionId } : {}),
      }
      mockPurchases.unshift(order)
      return jsonResponse(order)
    },
  },
  {
    method: 'GET',
    path: '/resource/purchases/sold',
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
    path: '/resource/purchases/sold/:orderNo',
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
    path: '/resource/purchases/:orderNo/seller-refund',
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
    path: '/resource/purchases/mine',
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
    path: '/resource/purchases/:orderNo',
    note: '我的资源购买订单详情',
    handler: (_request, params) => {
      const order = mockPurchases.find((item) => item.order_no === params.orderNo)
      return order ? jsonResponse(order) : textResponse('订单不存在', 404)
    },
  },
  {
    method: 'POST',
    path: '/resource/purchases/:orderNo/refund',
    note: '买家入口已按需求 Q9 关闭：恒 403',
    handler: () =>
      textResponse('退款仅限卖家或平台发起，买家不可自助退款；如需退款请联系卖家或客服', 403),
  },
]
