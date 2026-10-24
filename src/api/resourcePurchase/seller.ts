import { authHeaders, requestJson } from '@/api/http'

import type {
  ListSellerResourcePurchasesQuery,
  ResourcePurchaseOrder,
  SellerRefundPayload,
} from './types'

/** GET /api/resources/purchases/sold —— 卖家售出订单列表（仅本人售出） */
export async function listSellerResourcePurchases(
  token: string,
  query: ListSellerResourcePurchasesQuery = {},
): Promise<ResourcePurchaseOrder[]> {
  const params = new URLSearchParams()
  if (query.status?.trim()) {
    params.set('status', query.status.trim())
  }
  if (query.limit != null) {
    params.set('limit', String(query.limit))
  }
  if (query.offset != null) {
    params.set('offset', String(query.offset))
  }
  const qs = params.toString()
  return requestJson<ResourcePurchaseOrder[]>(
    `/resource/purchases/sold${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载售出订单失败',
  )
}

/** GET /api/resources/purchases/sold/{order_no} —— 卖家售出订单详情（仅本人售出） */
export async function getSellerResourcePurchase(
  token: string,
  orderNo: string,
): Promise<ResourcePurchaseOrder> {
  return requestJson<ResourcePurchaseOrder>(
    `/resource/purchases/sold/${encodeURIComponent(orderNo)}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载售出订单详情失败',
  )
}

/** POST /api/resources/purchases/{order_no}/seller-refund —— 卖家主动退款（可全额 / 部分） */
export async function sellerRefundResourcePurchase(
  token: string,
  orderNo: string,
  payload: SellerRefundPayload,
): Promise<ResourcePurchaseOrder> {
  const body: { reason: string; amount_fen?: number } = { reason: payload.reason.trim() }
  if (payload.amount_fen != null) {
    body.amount_fen = payload.amount_fen
  }
  return requestJson<ResourcePurchaseOrder>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/seller-refund`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '发起退款失败',
  )
}
