import { authHeaders, requestJson } from '@/api/http'
import { toResourcePayChannel, type ResourcePayChannelUi } from '@/shared/resourceSale'

export type ResourcePurchaseOrder = {
  order_no: string
  buyer: string
  resource_id: number
  resource_title: string | null
  seller: string
  amount_fen: number
  platform_fee_fen: number
  seller_net_fen: number
  platform_fee_bps: number
  amount_points: number
  platform_fee_points: number
  seller_net_points: number
  status: string
  pay_channel: string | null
  provider_payment_id: string | null
  provider_confirm_id: string | null
  pay_url: string | null
  split_status: string
  first_downloaded_at: string | null
  paid_at: string | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  /** 累计已退现金（分）；支持部分退后可能小于 `amount_fen` */
  refunded_amount_fen: number
  /** 剩余可退现金（分）= `amount_fen - refunded_amount_fen` */
  refundable_amount_fen: number
  /** 是否仍在「支付后 365 天」可退窗口内 */
  within_refund_window: boolean
  /** 下载权是否已被退款收回 */
  entitlement_revoked: boolean
  /** 最近一次退款的留痕（原因 / 发起方 / 操作人） */
  refund_reason: string | null
  /** `seller` | `admin` | `buyer` */
  refund_initiator: string | null
  refund_operator: string | null
  last_refund_at: string | null
}

export type CreateResourcePurchasePayload =
  | {
      pay_channel: ResourcePayChannelUi
      client_platform?: 'pc' | 'mobile'
    }
  | {
      pay_channel: 'points'
    }

export type ListMyResourcePurchasesQuery = {
  resource_id?: number
  status?: string
  limit?: number
  offset?: number
}

/** POST /api/resources/resources/{id}/purchase */
export async function createResourcePurchase(
  token: string,
  resourceId: number,
  payload: CreateResourcePurchasePayload,
): Promise<ResourcePurchaseOrder> {
  const body =
    payload.pay_channel === 'points'
      ? { pay_channel: 'points' }
      : {
          pay_channel: toResourcePayChannel(payload.pay_channel),
          client_platform: payload.client_platform ?? 'pc',
        }
  return requestJson<ResourcePurchaseOrder>(
    `/dev/resources/resources/${resourceId}/purchase`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '创建资源购买订单失败',
  )
}

/** GET /api/resources/purchases/mine */
export async function listMyResourcePurchases(
  token: string,
  query: ListMyResourcePurchasesQuery = {},
): Promise<ResourcePurchaseOrder[]> {
  const params = new URLSearchParams()
  if (query.resource_id != null) {
    params.set('resource_id', String(query.resource_id))
  }
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
    `/dev/resources/purchases/mine${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载已购资源失败',
  )
}

/** GET /api/resources/purchases/{order_no} */
export async function getMyResourcePurchase(
  token: string,
  orderNo: string,
): Promise<ResourcePurchaseOrder> {
  return requestJson<ResourcePurchaseOrder>(
    `/dev/resources/purchases/${encodeURIComponent(orderNo)}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载购买订单失败',
  )
}

/** POST /api/resources/purchases/{order_no}/refund 已按需求 Q9 关闭：买家不可自助退，接口恒 403。 */

export type ListSellerResourcePurchasesQuery = {
  status?: string
  limit?: number
  offset?: number
}

/**
 * 卖家主动退款请求体。
 *
 * `reason` 必填（≤200 字）；`amount_fen` 省略即退「剩余可退全额」，
 * 显式指定时须 > 0 且不超过 `refundable_amount_fen`。
 */
export type SellerRefundPayload = {
  reason: string
  amount_fen?: number
}

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
    `/dev/resources/purchases/sold${qs ? `?${qs}` : ''}`,
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
    `/dev/resources/purchases/sold/${encodeURIComponent(orderNo)}`,
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
    `/dev/resources/purchases/${encodeURIComponent(orderNo)}/seller-refund`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '发起退款失败',
  )
}

export type ResourceWechatAuthUrlResp = {
  url: string
  authorized: boolean
}

export type ResourceWechatJsapiResp = {
  order: ResourcePurchaseOrder
  pay_info: string
}

export type ResourceWechatStatusResp = {
  order: ResourcePurchaseOrder
  authorized: boolean
}

/** GET /api/resource/purchases/{order_no}/wechat-auth-url（公开，靠短时 token） */
export async function getResourceWechatAuthUrl(
  orderNo: string,
  token: string,
  redirectTo?: string,
): Promise<ResourceWechatAuthUrlResp> {
  const query = new URLSearchParams({ token })
  if (redirectTo?.trim()) {
    query.set('redirect_to', redirectTo.trim())
  }
  return requestJson<ResourceWechatAuthUrlResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-auth-url?${query.toString()}`,
    { method: 'GET' },
    '获取微信授权地址失败',
  )
}

/** POST /api/resource/purchases/{order_no}/wechat-jsapi（公开，靠短时 token） */
export async function completeResourceWechatJsapi(
  orderNo: string,
  token: string,
): Promise<ResourceWechatJsapiResp> {
  return requestJson<ResourceWechatJsapiResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-jsapi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    '创建微信支付失败',
  )
}

/** GET /api/resource/purchases/{order_no}/wechat-status（公开，靠短时 token） */
export async function getResourceWechatStatus(
  orderNo: string,
  token: string,
): Promise<ResourceWechatStatusResp> {
  const query = new URLSearchParams({ token })
  return requestJson<ResourceWechatStatusResp>(
    `/resource/purchases/${encodeURIComponent(orderNo)}/wechat-status?${query.toString()}`,
    { method: 'GET' },
    '查询资源购买订单失败',
  )
}
