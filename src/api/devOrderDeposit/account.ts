import { authHeaders, requestJson } from '@/api/http'
import { listPaymentOrders, refreshPaymentOrder } from '@/api/payments'

import { queryString } from './query'
import type {
  PrepaidAccountStatement,
  PrepaidOrder,
  PrepaidOrderList,
  PrepaidOrderQuery,
  PrepaidRechargeRequest,
  PrepaidWechatAuthUrl,
  PrepaidWechatJsapi,
  PrepaidWechatStatus,
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

// ── 微信充值中间页（PC 出码 → 手机微信里打开） ──────────────────
//
// 这三个端点认 query / body 里的 `token`，不靠 `Authorization`：手机那端没有平台
// 登录态，令牌只能随链接带过来。这里刻意不带 Authorization 头——手机上可能登录着
// 另一个账号，请求头会盖过链接里的令牌。

/** 微信充值第一步：取公众号网页授权地址（`GET …/wechat-auth-url`）。 */
export async function getPrepaidWechatAuthUrl(
  orderNo: string,
  token: string,
  redirectTo?: string,
): Promise<PrepaidWechatAuthUrl> {
  const query = new URLSearchParams({ token })
  if (redirectTo?.trim()) {
    query.set('redirect_to', redirectTo.trim())
  }
  return requestJson<PrepaidWechatAuthUrl>(
    `/payment/developer-order-deposit/orders/${encodeURIComponent(orderNo)}/wechat-auth-url?${query.toString()}`,
    { method: 'GET' },
    '获取微信授权地址失败',
  )
}

/** 微信充值第二步：补建渠道单并取 JSAPI 参数（`POST …/wechat-jsapi`）。 */
export async function completePrepaidWechatJsapi(
  orderNo: string,
  token: string,
): Promise<PrepaidWechatJsapi> {
  return requestJson<PrepaidWechatJsapi>(
    `/payment/developer-order-deposit/orders/${encodeURIComponent(orderNo)}/wechat-jsapi`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    '创建微信支付失败',
  )
}

/** 微信充值中间页轮询（`GET …/wechat-status`）。 */
export async function getPrepaidWechatStatus(
  orderNo: string,
  token: string,
): Promise<PrepaidWechatStatus> {
  const query = new URLSearchParams({ token })
  return requestJson<PrepaidWechatStatus>(
    `/payment/developer-order-deposit/orders/${encodeURIComponent(orderNo)}/wechat-status?${query.toString()}`,
    { method: 'GET' },
    '查询充值单失败',
  )
}

/**
 * 把「本地挂起、渠道其实已支付」的充值单补记入账。
 *
 * 渠道回调打在公网 `notify_url` 上，本地开发时进不来：用户扫完码付了钱，库里还停在
 * `pending`，刷新页面也看不到余额。这里列出本人挂起的充值单，逐单走
 * `POST /api/payment/orders/{order_no}/refresh` 向渠道核对一次——只有渠道明确回「已支付」
 * 才入账，未支付回 409，由调用方忽略。
 *
 * 单张失败不影响其它单；整步失败也不该阻断页面（返回 `false` 让调用方决定要不要提示）。
 */
export async function syncInflightRecharges(token: string): Promise<boolean> {
  try {
    const page = await listPaymentOrders(token, {
      status: 'pending',
      biz_type: 'developer_deposit_recharge',
      page_size: 20,
    })
    for (const order of page.items) {
      await refreshPaymentOrder(token, order.order_no).catch(() => undefined)
    }
    return true
  } catch {
    return false
  }
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
