import { HttpError, apiUrl, authHeaders, readErrorMessage, requestJson } from '@/api/http'
import { toResourcePayChannel } from '@/shared/resourceSale'

import type {
  CheckoutTicketExchangeResult,
  CreateResourcePurchasePayload,
  ListMyResourcePurchasesQuery,
  MyResourcePurchasesPage,
  ResourcePurchaseOrder,
} from './types'

/** POST /api/resources/resources/{id}/purchase */
export async function createResourcePurchase(
  token: string,
  resourceId: number,
  payload: CreateResourcePurchasePayload,
): Promise<ResourcePurchaseOrder> {
  const body = {
    ...payload,
    pay_channel: toResourcePayChannel(payload.pay_channel),
    client_platform: payload.client_platform ?? 'pc',
  }
  return requestJson<ResourcePurchaseOrder>(
    `/resource/resources/${resourceId}/purchase`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    },
    '创建资源购买订单失败',
  )
}

/** GET /api/resources/purchases/mine */
export function buildMyResourcePurchasesQuery(query: ListMyResourcePurchasesQuery): string {
  const params = new URLSearchParams()
  if (query.resource_id != null) {
    params.set('resource_id', String(query.resource_id))
  }
  if (query.status?.trim()) {
    params.set('status', query.status.trim())
  }
  if (query.keyword?.trim()) {
    params.set('keyword', query.keyword.trim())
  }
  if (query.limit != null) {
    params.set('limit', String(query.limit))
  }
  if (query.offset != null) {
    params.set('offset', String(query.offset))
  }
  return params.toString()
}

/** GET /api/resources/purchases/mine（裸数组：小程序等消费方仍按数组解析） */
export async function listMyResourcePurchases(
  token: string,
  query: ListMyResourcePurchasesQuery = {},
): Promise<ResourcePurchaseOrder[]> {
  const qs = buildMyResourcePurchasesQuery(query)
  return requestJson<ResourcePurchaseOrder[]>(
    `/resource/purchases/mine${qs ? `?${qs}` : ''}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载已购资源失败',
  )
}

/**
 * GET /api/resources/purchases/mine 的带总数版本。
 *
 * 后端保持裸数组响应（兼容小程序），筛选后的总数放在 `X-Total-Count` 响应头里，
 * 这里直接把头读出来给分页器用，避免前端拿全量数据「假分页」。
 */
export async function listMyResourcePurchasesPage(
  token: string,
  query: ListMyResourcePurchasesQuery = {},
): Promise<MyResourcePurchasesPage> {
  const qs = buildMyResourcePurchasesQuery(query)
  const response = await fetch(apiUrl(`/resource/purchases/mine${qs ? `?${qs}` : ''}`), {
    method: 'GET',
    headers: authHeaders(token),
    credentials: 'omit',
  })

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorMessage(response, '加载已购资源失败'))
  }

  const rawItems = (await response.json()) as ResourcePurchaseOrder[]
  const items = Array.isArray(rawItems) ? rawItems : []
  const rawTotal = Number(response.headers.get('X-Total-Count') ?? '')
  return {
    items,
    total: Number.isFinite(rawTotal) && rawTotal >= 0 ? rawTotal : items.length,
  }
}

/** 只取筛选后的总数（`limit=1`，用于页头读数条的分状态统计）。 */
export async function countMyResourcePurchases(
  token: string,
  query: ListMyResourcePurchasesQuery = {},
): Promise<number> {
  const page = await listMyResourcePurchasesPage(token, { ...query, limit: 1, offset: 0 })
  return page.total
}

/** GET /api/resources/purchases/{order_no} */
export async function getMyResourcePurchase(
  token: string,
  orderNo: string,
): Promise<ResourcePurchaseOrder> {
  return requestJson<ResourcePurchaseOrder>(
    `/resource/purchases/${encodeURIComponent(orderNo)}`,
    { method: 'GET', headers: authHeaders(token) },
    '加载购买订单失败',
  )
}

/**
 * POST /api/resource/checkout/exchange
 *
 * 票据本身就是凭据，不带 `Authorization`。票据单次使用、10 分钟有效，重复使用返回 403。
 */
export async function exchangeCheckoutTicket(
  ticket: string,
): Promise<CheckoutTicketExchangeResult> {
  return requestJson<CheckoutTicketExchangeResult>(
    '/resource/checkout/exchange',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    },
    '收银台登录失败',
  )
}

/** POST /api/resources/purchases/{order_no}/refund 已按需求 Q9 关闭：买家不可自助退，接口恒 403。 */
