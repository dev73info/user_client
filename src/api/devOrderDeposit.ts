/**
 * 开发者保证金（预付账户）接口。
 *
 * 契约：`/api/payment/developer-order-deposit*` 这一族（后端 `crates/business/payment/src/api/prepaid.rs`）。
 * 金额一律**整数分**（`*_fen`），没有 `*_cny`、也没有浮点元参与请求体；界面上按元展示是前端的事。
 *
 * 分两端：
 * | 用途 | 端点 | 权限 |
 * | --- | --- | --- |
 * | 开发者看自己的账 / 充值 / 退保证金 | `GET|POST /developer-order-deposit`、`/orders`、`/withdrawals` | 本人 |
 * | 平台查账 / 手工入账 / 删单 / 退款 | `/developer-order-deposit-accounts`、`/developer-order-deposit-orders*` | `payment-admin` |
 *
 * 类型来源：通用单据（提现 / 退款）直接取生成物 `components['schemas']`；
 * `Prepaid*` 这一族生成物 `src/api/generated/schema.d.ts` **尚未包含**（它是按 364 条路径的旧快照
 * 生成的，而 `openapi.json` 已刷新到 534 条，`Prepaid*` 是新增的），所以这里按快照逐字段手抄一份。
 * 重新生成生成物（`pnpm contract:write`）之前，这份形状就是编译期的唯一依据——
 * 改后端契约时请同步这里，不要凭印象补字段。
 */
import type { components } from '@/api/generated/schema'
import { authHeaders, requestJson, requestVoid } from '@/api/http'

type Schemas = components['schemas']

// ── 通用单据：生成物里已有，直接复用 ──────────────────────────

/** 提现单（契约 `WithdrawalResponse`）：`source` 区分 `income` / `prepaid` 两个池子。 */
export type PrepaidWithdrawal = Schemas['WithdrawalResponse']
/** 提现申请体（契约 `WithdrawalRequest`）：只有整数分与可选备注。 */
export type PrepaidWithdrawalRequest = Schemas['WithdrawalRequest']
/** 退款请求体（契约 `RefundRequest`）：`amount_fen` 缺省表示退剩余全额。 */
export type PrepaidRefundRequest = Schemas['RefundRequest']
/** 退款回执（契约 `RefundResponse`）。 */
export type PrepaidRefundResponse = Schemas['RefundResponse']

// ── 预付账户：快照有、生成物还没有（见文件头说明） ──────────────

/** 预付账户余额与累计（契约 `PrepaidAccountResponse`），全部整数分。 */
export type PrepaidAccount = {
  username: string
  balance_fen: number
  frozen_fen: number
  refunding_fen: number
  total_recharged_fen: number
  total_refunded_fen: number
  total_withdrawn_fen: number
  created_time: string
  updated_time: string
}

/** 一条预付流水（契约 `PrepaidLedgerResponse`）：`direction` 是收/支，`kind` 是业务类型。 */
export type PrepaidLedgerEntry = {
  id: number
  username: string
  direction: string
  kind: string
  amount_fen: number
  balance_after_fen: number
  ref_no: string
  note: string
  operator: string
  created_time: string
}

/**
 * 账户总览（契约 `PrepaidAccountStatementResponse`）。
 *
 * `withdrawable_fen` 是「现在还能申请提现的额度」，`pending_withdrawal_fen` 是「已申请未出账」，
 * 两者都由后端算；前端不要自己拿 `balance_fen` 减一遍，口径容易对不上。
 */
export type PrepaidAccountStatement = {
  account: PrepaidAccount
  ledger: PrepaidLedgerEntry[]
  pending_withdrawal_fen: number
  withdrawable_fen: number
}

/** 一张充值单（契约 `PrepaidOrderResponse`）：`client_action` 是拉起支付要用的渠道动作。 */
export type PrepaidOrder = {
  order_no: string
  biz_type: string
  biz_no: string
  payer: string
  amount_fen: number
  channel: string
  status: string
  status_label: string
  subject: string
  provider_payment_id?: string | null
  client_action?: unknown
  paid_at?: string | null
  created_time: string
}

/** 充值单分页（契约 `PrepaidOrderListResponse`）。 */
export type PrepaidOrderList = {
  total: number
  page: number
  page_size: number
  items: PrepaidOrder[]
}

/** 预付账户分页（契约 `PrepaidAccountPageResponse`，平台侧）。 */
export type PrepaidAccountPage = {
  total: number
  page: number
  page_size: number
  items: PrepaidAccount[]
}

/** 发起充值（契约 `PrepaidRechargeRequest`）：金额整数分，渠道与客户端形态必填。 */
export type PrepaidRechargeRequest = {
  amount_fen: number
  channel: string
  client_platform: string
  idempotency_key?: string | null
}

/** 平台手工入账（契约 `PrepaidCreditRequest`）。 */
export type PrepaidCreditRequest = {
  username: string
  amount_fen: number
  note: string
}

/** 充值单列表的筛选条件，与契约 query 一一对应。 */
export type PrepaidOrderQuery = {
  status?: string
  /** 东八区墙钟串（`YYYY-MM-DD HH:MM:SS`），与后端时间列同口径 */
  created_from?: string
  created_to?: string
  username?: string
  page?: number
  page_size?: number
}

/** 提现单列表的筛选条件：契约只支持按状态过滤与条数上限。 */
export type PrepaidWithdrawalQuery = { status?: string; limit?: number }

function queryString(query: Record<string, string | number | undefined>): string {
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
