import { authHeaders, requestJson, requestVoid } from '@/api/http'

import { queryString } from './query'
import type {
  PrepaidAccount,
  PrepaidAccountPage,
  PrepaidCreditRequest,
  PrepaidOrderList,
  PrepaidOrderQuery,
  PrepaidRefundRequest,
  PrepaidRefundResponse,
} from './types'

// ── 平台侧（`payment-admin` 权限） ────────────────────────────

/** 全部预付账户（`GET /api/payment/developer-order-deposit-accounts`）。 */
export async function listPrepaidAccounts(
  token: string,
  query: { page?: number; page_size?: number } = {},
): Promise<PrepaidAccountPage> {
  return requestJson<PrepaidAccountPage>(
    `/payment/developer-order-deposit-accounts${queryString(query)}`,
    { headers: authHeaders(token) },
    '加载预付账户列表失败',
  )
}

/** 全部充值单（`GET /api/payment/developer-order-deposit-orders`，平台侧）。 */
export async function listAllPrepaidOrders(
  token: string,
  query: PrepaidOrderQuery = {},
): Promise<PrepaidOrderList> {
  return requestJson<PrepaidOrderList>(
    `/payment/developer-order-deposit-orders${queryString(query)}`,
    { headers: authHeaders(token) },
    '加载保证金充值单列表失败',
  )
}

/**
 * 手工入账（`POST /api/payment/developer-order-deposit-orders/credit`）。
 *
 * 平台替开发者补记一笔保证金，返回入账后的账户余额。
 */
export async function creditPrepaidAccount(
  token: string,
  payload: PrepaidCreditRequest,
): Promise<PrepaidAccount> {
  return requestJson<PrepaidAccount>(
    '/payment/developer-order-deposit-orders/credit',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '保证金手工入账失败',
  )
}

/**
 * 删除充值单（`DELETE /api/payment/developer-order-deposit-orders/{payment_id}`，204）。
 *
 * 后端只允许删「钱还没动过」的单，其余回 409 并说明该先做什么——不在这里另写状态白名单。
 */
export async function deletePrepaidOrder(token: string, paymentId: string): Promise<void> {
  return requestVoid(
    `/payment/developer-order-deposit-orders/${encodeURIComponent(paymentId)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    '删除保证金充值单失败',
  )
}

/** 发起退款（`POST .../{payment_id}/refund`）：`amount_fen` 缺省退剩余全额，`reason` 必填。 */
export async function refundPrepaidOrder(
  token: string,
  paymentId: string,
  payload: PrepaidRefundRequest,
): Promise<PrepaidRefundResponse> {
  return requestJson<PrepaidRefundResponse>(
    `/payment/developer-order-deposit-orders/${encodeURIComponent(paymentId)}/refund`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发起保证金退款失败',
  )
}

/** 回查退款状态（`POST .../{payment_id}/refund/query`）：按退款单号问一次渠道。 */
export async function queryPrepaidRefund(
  token: string,
  paymentId: string,
  refundNo: string,
): Promise<PrepaidRefundResponse> {
  return requestJson<PrepaidRefundResponse>(
    `/payment/developer-order-deposit-orders/${encodeURIComponent(paymentId)}/refund/query`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refund_no: refundNo }),
    },
    '查询保证金退款状态失败',
  )
}

/** 人工确认退款结果（`POST .../{payment_id}/refund/manual`）：渠道回调没到时由人工落账。 */
export async function manualRefundPrepaidOrder(
  token: string,
  paymentId: string,
  refundNo: string,
): Promise<PrepaidRefundResponse> {
  return requestJson<PrepaidRefundResponse>(
    `/payment/developer-order-deposit-orders/${encodeURIComponent(paymentId)}/refund/manual`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refund_no: refundNo }),
    },
    '人工确认保证金退款失败',
  )
}
