import type { components } from '@/api/generated/schema'

import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

/** 一张支付单（契约 `PaymentOrderResponse`，字段即后端返回的 snake_case）。 */
export type PaymentOrder = Schemas['PaymentOrderResponse']

/** 我的支付单分页（契约 `MyOrderListResponse`：`items` + 分页三项）。 */
export type PaymentOrderPage = Schemas['MyOrderListResponse']

/** 发起退款（契约 `RefundRequest`）：`amount_fen` 缺省表示退全额。 */
export type PaymentRefundRequest = Schemas['RefundRequest']

/** 退款回执（契约 `RefundResponse`）。 */
export type PaymentRefundResult = Schemas['RefundResponse']

/** `GET /api/payment/orders` 的筛选条件，与契约的 query 参数一一对应。 */
export type PaymentOrderQuery = {
  status?: string
  biz_type?: string
  /** 东八区墙钟串（`YYYY-MM-DD HH:MM:SS`），与后端时间列同口径 */
  created_from?: string
  created_to?: string
  page?: number
  page_size?: number
}

function orderQuery(query: PaymentOrderQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') {
      continue
    }
    params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** 平台资金口径（契约 `PaymentConfig`）：定金比例、平台费率、违约金与个税基点在**万分之几**。 */
export type PaymentLimits = Schemas['PaymentConfig']

/**
 * 平台资金口径（`GET /api/payment/limits/system`）。
 *
 * 定金比例读 `deposit_ratio_bps`（万分之几：2000 = 20%），别再读 1.x 的
 * `deposit_ratio_percent`——那个字段在 2.0 不存在，读出来恒为 `undefined`，
 * 前端会静默退回默认比例。
 */
export async function getPaymentLimits(token: string): Promise<PaymentLimits> {
  return requestJson<PaymentLimits>(
    '/payment/limits/system',
    { headers: authHeaders(token) },
    '加载平台资金口径失败',
  )
}

/** 我的支付单列表（`GET /api/payment/orders`，按创建时间倒序）。 */
export async function listPaymentOrders(
  token: string,
  query: PaymentOrderQuery = {},
): Promise<PaymentOrderPage> {
  return requestJson<PaymentOrderPage>(
    `/payment/orders${orderQuery(query)}`,
    { headers: authHeaders(token) },
    '加载支付单失败',
  )
}

/** 单张支付单（`GET /api/payment/orders/{order_no}`）：读取本地支付状态。 */
export async function getPaymentOrder(token: string, orderNo: string): Promise<PaymentOrder> {
  return requestJson<PaymentOrder>(
    `/payment/orders/${encodeURIComponent(orderNo)}`,
    { headers: authHeaders(token) },
    '查询支付单状态失败',
  )
}

/** 主动向渠道查单并按真实回调链路入账；只有渠道明确已支付才返回 `paid`。 */
export function refreshPaymentOrder(token: string, orderNo: string): Promise<PaymentOrder> {
  return requestJson<PaymentOrder>(
    `/payment/orders/${encodeURIComponent(orderNo)}/refresh`,
    { method: 'POST', headers: authHeaders(token) },
    '刷新支付单状态失败',
  )
}

/**
 * 删除支付单（`DELETE /api/payment/orders/{order_no}`）。
 *
 * 后端只允许删「钱还没动过」的单（`created` / `failed` / `canceled`，且底下没有退款与分账底账），
 * 其余回 409 并说明该先做什么——不要在前端另写一套状态白名单去抢这个判定。
 */
export async function deletePaymentOrder(token: string, orderNo: string): Promise<void> {
  await requestJson<null>(
    `/payment/orders/${encodeURIComponent(orderNo)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    '删除支付单失败',
  )
}

/** 发起退款（`POST /api/payment/orders/{order_no}/refund`）。 */
export async function refundPaymentOrder(
  token: string,
  orderNo: string,
  payload: PaymentRefundRequest = {},
): Promise<PaymentRefundResult> {
  return requestJson<PaymentRefundResult>(
    `/payment/orders/${encodeURIComponent(orderNo)}/refund`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发起退款失败',
  )
}
