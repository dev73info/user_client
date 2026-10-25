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
 * 拆成 account（开发者自己的账）、admin（平台侧）与共用的 types；
 * 本文件只做汇总导出，调用方仍然 `import ... from '@/api/devOrderDeposit'`。
 */
export type {
  PrepaidAccount,
  PrepaidAccountPage,
  PrepaidAccountStatement,
  PrepaidCreditRequest,
  PrepaidLedgerEntry,
  PrepaidOrder,
  PrepaidOrderList,
  PrepaidOrderQuery,
  PrepaidRechargeRequest,
  PrepaidRefundRequest,
  PrepaidRefundResponse,
  PrepaidWithdrawal,
  PrepaidWithdrawalQuery,
  PrepaidWithdrawalRequest,
} from './devOrderDeposit/types'

export {
  createPrepaidRecharge,
  createPrepaidWithdrawal,
  getMyPrepaidOrder,
  getPrepaidAccountStatement,
  listMyPrepaidOrders,
  listMyPrepaidWithdrawals,
} from './devOrderDeposit/account'

export {
  creditPrepaidAccount,
  deletePrepaidOrder,
  listAllPrepaidOrders,
  listPrepaidAccounts,
  manualRefundPrepaidOrder,
  queryPrepaidRefund,
  refundPrepaidOrder,
} from './devOrderDeposit/admin'
