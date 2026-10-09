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

/** POST /api/resources/purchases/{order_no}/refund */
export async function refundResourcePurchase(
  token: string,
  orderNo: string,
): Promise<ResourcePurchaseOrder> {
  return requestJson<ResourcePurchaseOrder>(
    `/dev/resources/purchases/${encodeURIComponent(orderNo)}/refund`,
    { method: 'POST', headers: authHeaders(token) },
    '申请退款失败',
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
