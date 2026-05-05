import { apiUrl, authHeaders, requestJson } from '@dev/api/http'

export type DevOrderDepositOrderSummary = {
  payment_id: string
  channel: 'alipay' | 'wechat'
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
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  latest_order?: DevOrderDepositOrderSummary | null
}

export type DevOrderDepositWithdrawalRecord = {
  withdrawal_id: string
  creator: string
  source: 'developer_order_deposit'
  amount_cny: number
  channel: 'alipay' | 'wechat'
  account_name: string
  account_no: string
  account_no_masked: string
  status: 'pending_review' | 'approved' | 'rejected' | 'paid'
  note?: string | null
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  paid_reference?: string | null
  paid_at?: string | null
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
  channel: 'alipay' | 'wechat'
  account_name: string
  account_no: string
  note?: string | null
}

export type DevOrderDepositAlipayPage = {
  payment_id: string
  channel: 'alipay'
  amount_cny: number
  status: string
  page_html: string
  expires_at: string
}

export type DevOrderDepositWechatPayment = {
  payment_id: string
  channel: 'wechat'
  amount_cny: number
  status: string
  code_url: string
  expires_at: string
}

export type DevOrderDepositConfirmResponse = {
  payment_id: string
  status: string
  has_paid_deposit: boolean
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

export async function createDevOrderDepositAlipayPage(token: string, amount_cny: number): Promise<DevOrderDepositAlipayPage> {
  return requestJson<DevOrderDepositAlipayPage>(
    '/dev/payments/developer-order-deposit/alipay/page',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ amount_cny }),
    },
    '创建支付宝保证金订单失败',
  )
}

export async function createDevOrderDepositWechatPayment(token: string, amount_cny: number): Promise<DevOrderDepositWechatPayment> {
  return requestJson<DevOrderDepositWechatPayment>(
    '/dev/payments/developer-order-deposit/wechat/create',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ amount_cny }),
    },
    '创建微信保证金订单失败',
  )
}

export async function confirmDevOrderDepositAlipayPayment(
  token: string,
  payment_id: string,
): Promise<DevOrderDepositConfirmResponse> {
  return requestJson<DevOrderDepositConfirmResponse>(
    '/dev/payments/developer-order-deposit/alipay/confirm',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ payment_id }),
    },
    '确认支付宝保证金支付失败',
  )
}

export async function confirmDevOrderDepositWechatPayment(
  token: string,
  payment_id: string,
): Promise<DevOrderDepositConfirmResponse> {
  return requestJson<DevOrderDepositConfirmResponse>(
    '/dev/payments/developer-order-deposit/wechat/confirm',
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ payment_id }),
    },
    '确认微信保证金支付失败',
  )
}

export function getDevOrderDepositAlipayPageUrl(paymentId: string): string {
  return apiUrl(`/dev/payments/developer-order-deposit/alipay/page?payment_id=${encodeURIComponent(paymentId)}`)
}