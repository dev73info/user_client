import type { DevWalletOverview, DevWithdrawalRecord } from '@/api/devWallet'

import { settledIncome } from './payments'
import { DEV_NICKNAME, DEV_USERNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 开发者钱包（接单收入池） */

export const devWallet: DevWalletOverview = {
  total_income_cny: 38600,
  today_income_cny: 1280,
  today_income_change_rate: 12.5,
  total_completed_orders: 8,
  active_requirement_count: 3,
  withdrawable_balance_cny: 18420.5,
  pending_withdraw_cny: 3200,
  paid_withdraw_cny: 16800,
  recent_income: settledIncome,
}

/** 近 7 天到账金额（最早 → 今天），最后一位与今日收入自洽。 */
export const devDailyIncome: number[] = [420, 680, 960, 1320, 540, 1138, 1280]

function buildWithdrawal(
  id: number,
  amount: number,
  status: DevWithdrawalRecord['status'],
  daysAgo: number,
): DevWithdrawalRecord {
  const accountNo = '6222020200112233445'

  return {
    withdrawal_id: `WD-DEMO-${id}`,
    creator: DEV_USERNAME,
    amount_fen: Math.round(amount * 100),
    account_name: DEV_NICKNAME,
    account_no_tail: accountNo.slice(-4),
    status,
    status_label: status,
    note: '',
    review_note: status === 'rejected' ? '演示数据：收款账户信息不完整' : '',
    paid_time: status === 'paid' ? datetime(-daysAgo + 1, 14, 0) : null,
    payout_failure_reason: status === 'payout_failed' ? '演示数据：收款卡状态异常' : null,
    payout_attempts: status === 'pending_review' ? 0 : 1,
    created_time: datetime(-daysAgo, 9, 30),
  }
}

export const devWithdrawals: DevWithdrawalRecord[] = [
  buildWithdrawal(1, 3200, 'pending_review', 1),
  buildWithdrawal(2, 5000, 'paid', 8),
  buildWithdrawal(3, 2800, 'paid', 21),
]

export const devWithdrawalSetting = {
  auto_withdraw_enabled: false,
  auto_withdraw_enabled_at: null as string | null,
  payout_channel_ready: true,
  auto_payout_available: false,
  auto_payout_blocked_reason: '自动提现开关未开启',
  auto_payout_max_fen: 0,
  auto_payout_note: '限额内可自动出款，其余提现进入人工审核',
  account_no_tail: '3445',
}

/** 提现限额（契约 `WithdrawalConfig`，单位一律分；`0` 表示不设限）。 */
export const devWithdrawalLimits = {
  min_fen: 100,
  max_fen: 5000000,
  auto_payout_max_fen: 1000000,
  reconcile_cooldown_secs: 60,
  reconcile_on_read: true,
}
