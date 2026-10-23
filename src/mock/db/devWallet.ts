import type { DevOrderDepositStatus } from '@/api/devOrderDeposit'
import type { DevWalletOverview, DevWithdrawalRecord } from '@/api/devWallet'

import { settledIncome } from './payments'
import { DEV_NICKNAME, DEV_USERNAME, datetime } from './shared'

/* ------------------------------------------------------------------ 开发者钱包与保证金 */

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

/**
 * 接单保证金。可用额度刻意留在「够接大厅里那两单」的水平：大厅的接单按钮要求
 * 可用保证金 ≥ 需求预算（见 DevRequirementHallView 的「保证金不足」判定），
 * 额度太小的话演示时点不动「接单」。
 */
export const devOrderDeposit: DevOrderDepositStatus = {
  username: DEV_USERNAME,
  role: 'dev',
  has_paid_deposit: true,
  can_bind_requirement: true,
  total_paid_cny: 50000,
  frozen_cny: 4800,
  available_cny: 45200,
  pending_refund_cny: 0,
  pending_withdraw_cny: 0,
  paid_withdraw_cny: 0,
  latest_order: {
    payment_id: 'PAY-DEPOSIT-DEMO-1',
    channel: 'adapay',
    amount_cny: 50000,
    status: 'paid',
    expires_at: null,
    created_at: datetime(-30, 10, 0),
    updated_at: datetime(-30, 10, 5),
  },
}

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
    amount_cny: amount,
    channel: 'adapay',
    account_name: DEV_NICKNAME,
    account_no: accountNo,
    account_no_masked: `6222********${accountNo.slice(-4)}`,
    status,
    note: null,
    review_note: status === 'rejected' ? '演示数据：收款账户信息不完整' : null,
    reviewed_by: status === 'pending_review' ? null : 'admin_demo',
    reviewed_at: status === 'pending_review' ? null : datetime(-daysAgo + 1, 10, 0),
    paid_reference: status === 'paid' ? `ADAPAY-DEMO-${id}` : null,
    paid_at: status === 'paid' ? datetime(-daysAgo + 1, 14, 0) : null,
    payout_failure_message: status === 'payout_failed' ? '演示数据：收款卡状态异常' : null,
    payout_started_at: status === 'payout_processing' ? datetime(-daysAgo, 9, 0) : null,
    payout_attempts: status === 'pending_review' ? 0 : 1,
    created_at: datetime(-daysAgo, 9, 30),
    updated_at: datetime(-daysAgo + 1, 14, 0),
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
  payout_channel_message: null as string | null,
  payout_schedule_note: '出款按 T+1 到账，遇节假日顺延。',
  payout_account_no: '6222********3445',
}

export const devWithdrawalLimits = {
  min_amount_cny: 1,
  max_amount_cny: 50000,
  alipay_enabled: false,
  wechat_enabled: false,
  account_name_min_len: 2,
  account_name_max_len: 40,
  account_no_min_len: 6,
  account_no_max_len: 80,
  note_max_len: 200,
}
