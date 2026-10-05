import { authHeaders, requestJson } from '@/api/http'

export type DevOrderDepositOrderSummary = {
  payment_id: string
  channel: 'adapay'
  amount_cny: number
  status: 'created' | 'paid' | 'failed' | 'closed'
  expires_at?: string | null
  created_at: string
  updated_at: string
}

export type DevOrderDepositStatus = {
  username: string
  role: string
  has_paid_deposit: boolean
  can_bind_requirement: boolean
  total_paid_cny: number
  frozen_cny: number
  available_cny: number
  pending_refund_cny: number
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  latest_order?: DevOrderDepositOrderSummary | null
}

export type DevOrderDepositWithdrawalRecord = {
  withdrawal_id: string
  creator: string
  source: 'developer_order_deposit'
  amount_cny: number
  channel: 'adapay'
  account_name: string
  account_no: string
  account_no_masked: string
  status: 'pending_review' | 'approved' | 'payout_processing' | 'payout_failed' | 'rejected' | 'paid'
  note?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  paid_reference?: string | null
  paid_at?: string | null
  payout_failure_message?: string | null
  created_at: string
  updated_at: string
}

export type DevOrderDepositWithdrawalSummary = {
  withdrawable_balance_cny: number
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  withdrawals: DevOrderDepositWithdrawalRecord[]
}

export type CreateDevOrderDepositWithdrawalRequest = {
  amount_cny: number
  channel: 'adapay'
  account_name: string
  account_no: string
  note?: string | null
}

export async function getDevOrderDepositStatus(token: string): Promise<DevOrderDepositStatus> {
  return requestJson<DevOrderDepositStatus>(
    '/dev/payments/developer-order-deposit',
    {
      headers: authHeaders(token),
    },
    '加载接单保证金状态失败',
  )
}

export async function getDevOrderDepositWithdrawalSummary(token: string): Promise<DevOrderDepositWithdrawalSummary> {
  return requestJson<DevOrderDepositWithdrawalSummary>(
    '/dev/payments/developer-order-deposit/withdrawals',
    {
      headers: authHeaders(token),
    },
    '加载保证金提现记录失败',
  )
}

/**
 * 列出自己的保证金充值记录（**已支付**的订单，最新在前）。
 *
 * 钱包总览只下发 `latest_order`（够说明「最近一次充值」），「资金明细」要把保证金充值与提现、
 * 接单收入、收入提现放在一张表里，所以需要这份历史。
 */
export async function getDevOrderDepositOrders(token: string): Promise<DevOrderDepositOrderSummary[]> {
  return requestJson<DevOrderDepositOrderSummary[]>(
    '/dev/payments/developer-order-deposit/orders',
    {
      headers: authHeaders(token),
    },
    '加载保证金充值记录失败',
  )
}

export async function createDevOrderDepositWithdrawalRequest(
  token: string,
  payload: CreateDevOrderDepositWithdrawalRequest,
): Promise<DevOrderDepositWithdrawalRecord> {
  return requestJson<DevOrderDepositWithdrawalRecord>(
    '/dev/payments/developer-order-deposit/withdrawals',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '提交保证金提现申请失败',
  )
}
