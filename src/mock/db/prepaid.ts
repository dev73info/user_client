/**
 * 开发者保证金（2.0 叫「预付账户」）的假数据。
 *
 * 这一族接口在 mock 里原本整组缺失，`GET /api/payment/developer-order-deposit` 兜底回 `[]`，
 * `useDevWalletDeposit` 读 `account.balance_fen` 直接抛错，钱包页的「保证金余额」卡一直是异常态。
 * 这里给一份自洽的账：余额 = 累计充值 − 累计提现 − 冻结，可提额度 = 余额 − 已申请未出账。
 *
 * 金额一律整数分。数据只在内存里，充值 / 提现会真的改这里，刷新页面回到初始值。
 */

import type { PrepaidAccount, PrepaidLedgerEntry, PrepaidWithdrawal } from '@/api/devOrderDeposit'

import { DEV_NICKNAME, DEV_USERNAME, datetime } from './shared'

/** 初始余额（分）：1200.00 */
const INITIAL_BALANCE_FEN = 120000

export const prepaidAccount: PrepaidAccount = {
  username: DEV_USERNAME,
  balance_fen: INITIAL_BALANCE_FEN,
  frozen_fen: 0,
  refunding_fen: 0,
  total_recharged_fen: INITIAL_BALANCE_FEN,
  total_refunded_fen: 0,
  total_withdrawn_fen: 0,
  created_time: datetime(-60, 10, 0),
  updated_time: datetime(-1, 9, 30),
}

export const prepaidLedger: PrepaidLedgerEntry[] = [
  {
    id: 1,
    username: DEV_USERNAME,
    direction: 'in',
    kind: 'recharge',
    amount_fen: INITIAL_BALANCE_FEN,
    balance_after_fen: INITIAL_BALANCE_FEN,
    ref_no: 'RC-DEMO-1',
    note: '演示数据：保证金充值',
    operator: DEV_USERNAME,
    created_time: datetime(-60, 10, 0),
  },
]

export const prepaidWithdrawals: PrepaidWithdrawal[] = []

let nextLedgerId = 2
let nextWithdrawalSeq = 1

/** 追加一条流水，并把余额一起推到位。`direction` 用 `in` / `out`。 */
export function appendLedger(
  direction: 'in' | 'out',
  kind: string,
  amountFen: number,
  refNo: string,
  note: string,
): PrepaidLedgerEntry {
  prepaidAccount.balance_fen += direction === 'in' ? amountFen : -amountFen
  if (direction === 'in') {
    prepaidAccount.total_recharged_fen += amountFen
  } else if (kind === 'withdraw') {
    prepaidAccount.total_withdrawn_fen += amountFen
  }
  prepaidAccount.updated_time = datetime(0, 12, 0)

  const entry: PrepaidLedgerEntry = {
    id: nextLedgerId,
    username: DEV_USERNAME,
    direction,
    kind,
    amount_fen: amountFen,
    balance_after_fen: prepaidAccount.balance_fen,
    ref_no: refNo,
    note,
    operator: DEV_USERNAME,
    created_time: prepaidAccount.updated_time,
  }
  nextLedgerId += 1
  prepaidLedger.unshift(entry)

  return entry
}

/** 新提现单：与真实后端一致，提交即占住可提额度，状态为待审核。 */
export function pushPrepaidWithdrawal(amountFen: number, note: string): PrepaidWithdrawal {
  const record: PrepaidWithdrawal = {
    withdrawal_id: `PWD-DEMO-${nextWithdrawalSeq}`,
    creator: DEV_USERNAME,
    amount_fen: amountFen,
    account_name: DEV_NICKNAME,
    account_no_tail: '3445',
    source: 'prepaid',
    status: 'pending_review',
    status_label: '待审核',
    note,
    review_note: '',
    paid_time: null,
    payout_failure_reason: null,
    payout_attempts: 0,
    created_time: datetime(0, 12, 0),
  }
  nextWithdrawalSeq += 1
  prepaidWithdrawals.unshift(record)

  return record
}

/** 已申请未出账（分）：待审核 + 打款中的单子合计。 */
export function pendingPrepaidWithdrawalFen(): number {
  return prepaidWithdrawals
    .filter((item) => item.status === 'pending_review' || item.status === 'payout_pending')
    .reduce((sum, item) => sum + item.amount_fen, 0)
}

/** 现在还能提多少（分）。前端不自己拿余额减，口径只在这里算一次。 */
export function withdrawablePrepaidFen(): number {
  return Math.max(0, prepaidAccount.balance_fen - pendingPrepaidWithdrawalFen())
}
