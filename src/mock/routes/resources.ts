/**
 * 资源：开发者侧的「我的资源 / 版本管理」与门户公开的资源市场。
 *
 * 公开列表用的是同一批资源，只挑 `published` 的；下载接口返回一段占位内容，
 * 前端读流、写进度、触发保存这条链能完整跑一遍，不会卡在空的响应体上。
 */

import type { McResourcePayload, McResourceVersionPayload } from '@/api/mcResources'
import type { ResourcePurchaseOrder } from '@/api/resourcePurchase'

import {
  DEV_USERNAME,
  createResourceRecord,
  createVersionRecord,
  mcResources,
  mcResourceVersions,
  versionsOf,
} from '../db'
import { currentMockProfile } from '../identity'
import { defineRouteTable, type MockRoute } from '../router'
import { jsonResponse, noContentResponse, readInt, readString, textResponse } from '../response'

const mockPurchases: ResourcePurchaseOrder[] = []
let nextPurchaseSeq = 1

function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function findPaidEntitlement(buyer: string, resourceId: number): ResourcePurchaseOrder | undefined {
  return mockPurchases.find(
    (item) =>
      item.buyer === buyer &&
      item.resource_id === resourceId &&
      item.status === 'paid',
  )
}

function mockBuyer(): string {
  return currentMockProfile().username
}

function myResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.creator === DEV_USERNAME)
}

function publishedResources(): McResourcePayload[] {
  return mcResources.filter((item) => item.visibility === 'published')
}

/** 公开资源多带几个门户卡片要用的字段（与后端的 public 视图对齐）。 */
function toPublicResource(resource: McResourcePayload, buyer?: string | null) {
  const withFeatured = resource as McResourcePayload & {
    is_featured?: boolean
    like_count?: number
  }
  const purchased =
    Boolean(buyer) && Boolean(findPaidEntitlement(buyer!, resource.id))
  return {
    ...resource,
    price_fen: resource.price_fen ?? 0,
    price_points: resource.price_points ?? 0,
    copyright_declared: resource.copyright_declared ?? false,
    copyright_declared_at: resource.copyright_declared_at ?? null,
    purchased_by_me: purchased,
    versions: versionsOf(resource.id).length,
    download_count: 12,
    like_count: withFeatured.like_count ?? 0,
    is_featured: Boolean(withFeatured.is_featured),
    updated_at: resource.updated_at,
  }
}

const MOCK_PACKAGE_CONTENT = 'mock resource package\n'.repeat(200)

function downloadResponse(fileName: string): Response {
  return new Response(MOCK_PACKAGE_CONTENT, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Length': String(new Blob([MOCK_PACKAGE_CONTENT]).size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

const routes: MockRoute[] = [
  /* ---------------------------------------------------------------- 开发者侧 */
  {
    method: 'GET',
    path: '/dev/resources/resources',
    note: '我的资源列表',
    handler: () => jsonResponse(myResources()),
  },
  {
    method: 'POST',
    path: '/dev/resources/resources',
    note: '发布资源',
    handler: (request) => {
      const body = (request.body ?? {}) as {
        title?: string
        author?: string
        description?: string
        platform?: string
        file_name?: string
        source_url?: string
        requirement_id?: string | null
        visibility?: McResourcePayload['visibility']
        price_fen?: number
        price_points?: number
        copyright_declared?: boolean
        /** R029：推广分成比例（万分比） */
        promo_share_bps?: number
      }

      const created = createResourceRecord({
        title: body.title?.trim() || '未命名资源',
        author: body.author?.trim() || DEV_USERNAME,
        description: body.description?.trim() || '',
        platform: body.platform?.trim() || '自研工具',
        file_name: body.file_name?.trim() || 'resource.zip',
        source_url: body.source_url ?? '',
        requirement_id: body.requirement_id ?? null,
        visibility: body.visibility ?? 'review',
        promo_share_bps: body.promo_share_bps ?? 0,
      })
      created.price_fen = body.price_fen ?? 0
      created.price_points = body.price_points ?? 0
      created.copyright_declared = Boolean(body.copyright_declared)
      if (created.copyright_declared) {
        created.copyright_declared_at = nowIso()
      }
      return jsonResponse(created)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/team',
    note: '团队资源（演示数据里没有团队资源）',
    handler: () => jsonResponse([]),
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/:resourceId',
    note: '资源详情',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource ? jsonResponse(resource) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'PATCH',
    path: '/dev/resources/resources/:resourceId',
    note: '更新资源主页',
    handler: (request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }

      const body = (request.body ?? {}) as Partial<McResourcePayload>
      Object.assign(resource, {
        ...body,
        tag_selections: body.tag_selections ?? resource.tag_selections,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ''),
      })

      return jsonResponse(resource)
    },
  },
  {
    method: 'DELETE',
    path: '/dev/resources/resources/:resourceId',
    note: '删除资源',
    handler: (_request, params) => {
      const index = mcResources.findIndex((item) => String(item.id) === params.resourceId)
      if (index >= 0) {
        mcResources.splice(index, 1)
      }

      return noContentResponse()
    },
  },
  {
    method: 'POST',
    path: '/dev/resources/resources/:resourceId/cover',
    note: '上传资源封面（mock 不存文件，回显现有资源）',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource ? jsonResponse(resource) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/dev/resources/resources/:resourceId/versions',
    note: '版本列表',
    handler: (_request, params) =>
      jsonResponse(versionsOf(Number(params.resourceId)) as McResourceVersionPayload[]),
  },
  {
    method: 'POST',
    path: '/dev/resources/resources/:resourceId/versions',
    note: '发布新版本（multipart：version / note / file）',
    handler: (request, params) => {
      const body = (request.body ?? {}) as { version?: string; note?: string }
      const record = createVersionRecord(
        Number(params.resourceId),
        body.version?.trim() || 'v1.0.0',
        body.note?.trim() || null,
      )

      return record ? jsonResponse(record) : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'PATCH',
    path: '/dev/resources/resources/:resourceId/versions/:versionId',
    note: '更新版本',
    handler: (request, params) => {
      const record = mcResourceVersions.find((item) => String(item.id) === params.versionId)
      if (!record) {
        return textResponse('版本不存在', 404)
      }

      const body = (request.body ?? {}) as { version?: string; note?: string }
      record.version = body.version?.trim() || record.version
      record.note = body.note?.trim() || record.note

      return jsonResponse(record)
    },
  },
  {
    method: 'DELETE',
    path: '/dev/resources/resources/:resourceId/versions/:versionId',
    note: '删除版本',
    handler: (_request, params) => {
      const index = mcResourceVersions.findIndex((item) => String(item.id) === params.versionId)
      if (index >= 0) {
        mcResourceVersions.splice(index, 1)
      }

      return noContentResponse()
    },
  },

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
      if (!Number.isFinite(amountFen) || amountFen <= 0 || amountFen > order.refundable_amount_fen) {
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

  /* ---------------------------------------------------------------- 门户公开 */
  {
    method: 'GET',
    path: '/resource/resources',
    note: '门户资源市场列表（已公开的资源）',
    handler: () =>
      jsonResponse(publishedResources().map((item) => toPublicResource(item, mockBuyer()))),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId',
    note: '门户资源详情',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      return resource
        ? jsonResponse(toPublicResource(resource, mockBuyer()))
        : textResponse('资源不存在', 404)
    },
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions',
    note: '门户资源的版本列表',
    handler: (_request, params) => jsonResponse(versionsOf(Number(params.resourceId))),
  },
  {
    method: 'GET',
    path: '/resource/resources/:resourceId/versions/:versionId/download',
    note: '下载资源版本：返回一段占位内容，前端的下载进度与保存链路能完整跑通',
    handler: (_request, params) => {
      const resource = mcResources.find((item) => String(item.id) === params.resourceId)
      if (!resource) {
        return textResponse('资源不存在', 404)
      }
      const buyer = mockBuyer()
      if ((resource.price_fen ?? 0) > 0) {
        const isOwner = buyer === resource.creator
        const entitled = findPaidEntitlement(buyer, resource.id)
        if (!isOwner && !entitled) {
          return textResponse('请先购买该资源后再下载', 403)
        }
        if (entitled && !entitled.first_downloaded_at) {
          entitled.first_downloaded_at = nowIso()
          entitled.updated_at = entitled.first_downloaded_at
        }
      }
      return downloadResponse(`resource-${params.resourceId ?? '0'}-${params.versionId ?? '0'}.zip`)
    },
  },
  {
    method: 'GET',
    path: '/resources/tags',
    note: '资源标签分组原始数据：mock 返回空数组，标签树会是空的（不做假标签，避免与 wasm 的解析口径打架）',
    handler: () => jsonResponse([]),
  },
]

export const resourceRoutes = defineRouteTable('resources', routes)
