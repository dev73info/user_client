/**
 * 预付账户契约类型。
 *
 * 生成物已刷新到包含 `Prepaid*` 一族（`pnpm contract:write` 会按 `openapi.json` 重写），
 * 这里一律直接取 `components['schemas']`，不再手抄形状——手抄那份已经和后端契约漂移过。
 */
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

// ── 通用单据 ──────────────────────────────────────────────────

/** 提现单（契约 `WithdrawalResponse`）：`source` 区分 `income` / `prepaid` 两个池子。 */
export type PrepaidWithdrawal = Schemas['WithdrawalResponse']
/** 提现申请体（契约 `WithdrawalRequest`）：只有整数分与可选备注。 */
export type PrepaidWithdrawalRequest = Schemas['WithdrawalRequest']
/** 退款请求体（契约 `RefundRequest`）：`amount_fen` 缺省表示退剩余全额。 */
export type PrepaidRefundRequest = Schemas['RefundRequest']
/** 退款回执（契约 `RefundResponse`）。 */
export type PrepaidRefundResponse = Schemas['RefundResponse']

// ── 预付账户 ──────────────────────────────────────────────────

/** 预付账户余额与累计（契约 `PrepaidAccountResponse`），全部整数分。 */
export type PrepaidAccount = Schemas['PrepaidAccountResponse']

/** 一条预付流水（契约 `PrepaidLedgerResponse`）：`direction` 是收/支，`kind` 是业务类型。 */
export type PrepaidLedgerEntry = Schemas['PrepaidLedgerResponse']

/**
 * 账户总览（契约 `PrepaidAccountStatementResponse`）。
 *
 * `available_fen` 是「可用保证金」（托管可用 + 历史余额，可冻结 / 可退回）；
 * `withdrawable_fen` 在方案 C 下固定 0（保证金不可提现），页面不再用它判断能不能退；
 * `pending_withdrawal_fen` 是「已申请未出账」。三者都由后端算，
 * 前端不要自己拿 `balance_fen` 减一遍，口径容易对不上。
 */
export type PrepaidAccountStatement = Schemas['PrepaidAccountStatementResponse']

/** 一张充值单（契约 `PrepaidOrderResponse`）：`client_action` 是拉起支付要用的渠道动作。 */
export type PrepaidOrder = Schemas['PrepaidOrderResponse']

/** 充值单分页（契约 `PrepaidOrderListResponse`）。 */
export type PrepaidOrderList = Schemas['PrepaidOrderListResponse']

/** 预付账户分页（契约 `PrepaidAccountPageResponse`，平台侧）。 */
export type PrepaidAccountPage = Schemas['PrepaidAccountPageResponse']

/** 发起充值（契约 `PrepaidRechargeRequest`）：金额整数分，渠道与客户端形态必填。 */
export type PrepaidRechargeRequest = Schemas['PrepaidRechargeRequest']

// ── 微信充值（中间页三步） ─────────────────────────────────────

/** 授权地址与是否已授权（契约 `PrepaidWechatAuthUrlResponse`）。 */
export type PrepaidWechatAuthUrl = Schemas['PrepaidWechatAuthUrlResponse']

/** 充值单快照与 JSAPI 参数包（契约 `PrepaidWechatJsapiResponse`）。 */
export type PrepaidWechatJsapi = Schemas['PrepaidWechatJsapiResponse']

/** 中间页轮询结果（契约 `PrepaidWechatStatusResponse`）。 */
export type PrepaidWechatStatus = Schemas['PrepaidWechatStatusResponse']

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
