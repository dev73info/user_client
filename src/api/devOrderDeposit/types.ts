/**
 * 预付账户契约类型。
 *
 * 通用单据（提现 / 退款）直接取生成物 `components['schemas']`；
 * `Prepaid*` 这一族生成物 `src/api/generated/schema.d.ts` **尚未包含**（它是按 364 条路径的旧快照
 * 生成的，而 `openapi.json` 已刷新到 534 条，`Prepaid*` 是新增的），所以这里按快照逐字段手抄一份。
 * 重新生成生成物（`pnpm contract:write`）之前，这份形状就是编译期的唯一依据——
 * 改后端契约时请同步这里，不要凭印象补字段。
 */
import type { components } from '@/api/generated/schema'

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
