import { authHeaders, requestJson } from '@/api/http'

import { queryString } from './query'
import type {
  PrepaidAccountStatement,
  PrepaidOrder,
  PrepaidOrderList,
  PrepaidOrderQuery,
  PrepaidRechargeRequest,
  PrepaidWithdrawal,
  PrepaidWithdrawalQuery,
  PrepaidWithdrawalRequest,
} from './types'

// ── 开发者自己的账 ───────────────────────────────────────────

/**
 * 保证金总览：余额、累计、流水与可提现额度（`GET /api/payment/developer-order-deposit`）。
 *
 * `ledgerLimit` 缺省由后端决定条数；页面要「最近 N 条」时显式传。
 */
export async function getPrepaidAccountStatement(
  token: string,
  ledgerLimit?: number,
): Promise<PrepaidAccountStatement> {
  return requestJson<PrepaidAccountStatement>(
    `/payment/developer-order-deposit${queryString({ ledger_limit: ledgerLimit })}`,
    { headers: authHeaders(token) },
    '加载保证金账户失败',
  )
}

/**
 * 发起充值下单（`POST /api/payment/developer-order-deposit`）。
 *
 * 金额必须是整数分。返回的 `order_no` 就是支付单号（查单走 `GET /api/payment/orders/{order_no}`），
 * `client_action` 里带拉起支付要用的地址 / 参数包。
 */
export async function createPrepaidRecharge(
  token: string,
  payload: PrepaidRechargeRequest,
): Promise<PrepaidOrder> {
  return requestJson<PrepaidOrder>(
    '/payment/developer-order-deposit',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '创建保证金充值订单失败',
  )
}

/** 我的充值单（`GET /api/payment/developer-order-deposit/orders`，最新在前）。 */
export async function listMyPrepaidOrders(
  token: string,
  query: PrepaidOrderQuery = {},
): Promise<PrepaidOrderList> {
  return requestJson<PrepaidOrderList>(
    `/payment/developer-order-deposit/orders${queryString(query)}`,
    { headers: authHeaders(token) },
    '加载保证金充值记录失败',
  )
}

/** 单张充值单（`GET /api/payment/developer-order-deposit/orders/{payment_id}`）。 */
export async function getMyPrepaidOrder(token: string, paymentId: string): Promise<PrepaidOrder> {
  return requestJson<PrepaidOrder>(
    `/payment/developer-order-deposit/orders/${encodeURIComponent(paymentId)}`,
    { headers: authHeaders(token) },
    '加载保证金充值单失败',
  )
}

/** 我的保证金提现单（`GET /api/payment/developer-order-deposit/withdrawals`）。 */
export async function listMyPrepaidWithdrawals(
  token: string,
  query: PrepaidWithdrawalQuery = {},
): Promise<PrepaidWithdrawal[]> {
  return requestJson<PrepaidWithdrawal[]>(
    `/payment/developer-order-deposit/withdrawals${queryString(query)}`,
    { headers: authHeaders(token) },
    '加载保证金提现记录失败',
  )
}

/**
 * 申请退回保证金（`POST /api/payment/developer-order-deposit/withdrawals`）。
 *
 * 只发整数分与备注：收款账户取账号中心绑定的那一张，前端不传也不该传。
 */
export async function createPrepaidWithdrawal(
  token: string,
  payload: PrepaidWithdrawalRequest,
): Promise<PrepaidWithdrawal> {
  return requestJson<PrepaidWithdrawal>(
    '/payment/developer-order-deposit/withdrawals',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '提交保证金提现申请失败',
  )
}
