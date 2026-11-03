/**
 * 保证金池的两类资金动作 → 资金明细的行：
 *
 * | 类型 | 数据来源 | 说明 |
 * | --- | --- | --- |
 * | 保证金充值 | 预付账户流水的 `kind = recharge` | 账户内部动作（freeze / unfreeze / refund_*）不进来 |
 * | 保证金提现 | `GET /payment/developer-order-deposit/withdrawals` | 待审核的单子也进表，状态照实写 |
 *
 * `FundRecord` 只做类型引用（`import type`，编译后不存在），所以这里不会和
 * `devFundDisplay.ts` 形成运行时循环依赖。
 */
import type { PrepaidLedgerEntry, PrepaidWithdrawal } from '@/api/devOrderDeposit'

import type { FundRecord } from './devFundDisplay'
import { incomeWithdrawalStatusText, statusTagType } from './devWithdrawalStatus'

export function buildDepositFundRecords(
  depositLedger: PrepaidLedgerEntry[],
  depositWithdrawals: PrepaidWithdrawal[],
): FundRecord[] {
  const rows: FundRecord[] = []

  for (const entry of depositLedger) {
    // 只把「充值」搬进这张表：冻结 / 解冻 / 退款占用是账户内部动作，不是资金进出。
    if (entry.kind !== 'recharge') {
      continue
    }
    rows.push({
      key: `deposit_recharge:${entry.id}`,
      kind: 'deposit_recharge',
      id: entry.ref_no || String(entry.id),
      amount: entry.amount_fen / 100,
      detail: '保证金充值',
      account: entry.note || '接单保证金',
      status: '已入账',
      tag: 'success',
      note: entry.note || '-',
      reference: entry.ref_no,
      time: entry.created_time,
    })
  }

  for (const record of depositWithdrawals) {
    rows.push({
      key: `deposit_withdrawal:${record.withdrawal_id}`,
      kind: 'deposit_withdrawal',
      id: record.withdrawal_id,
      amount: record.amount_fen / 100,
      detail: `保证金提现 · ${record.account_name}`,
      account: record.account_no_tail,
      status: incomeWithdrawalStatusText(record.status, record.status_label),
      tag: statusTagType(record.status),
      note: record.review_note || record.payout_failure_reason || '-',
      reference: record.withdrawal_id,
      time: record.created_time,
    })
  }

  return rows
}
