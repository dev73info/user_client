import { authHeader, requestJson } from '@dev/api/http'

export type DevWalletIncomeItem = {
  payment_id: string
  requirement_id: string
  title: string
  customer: string
  amount_cny: number
  paid_at: string
  requirement_status: string
}

export type DevWalletOverview = {
  total_income_cny: number
  today_income_cny: number
  today_income_change_rate: number
  total_completed_orders: number
  active_requirement_count: number
  withdrawable_balance_cny: number
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  recent_income: DevWalletIncomeItem[]
}

export type DevWithdrawalRecord = {
  withdrawal_id: string
  creator: string
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

export type DevWithdrawalSummary = {
  withdrawable_balance_cny: number
  pending_withdraw_cny: number
  paid_withdraw_cny: number
  withdrawals: DevWithdrawalRecord[]
}

export type CreateDevWithdrawalRequest = {
  amount_cny: number
  channel: 'alipay' | 'wechat'
  account_name: string
  account_no: string
  note?: string | null
}

export function validateDevWithdrawalRequest(
  payload: CreateDevWithdrawalRequest,
  withdrawableBalance?: number | null,
): string | null {
  if (!Number.isFinite(payload.amount_cny) || payload.amount_cny < 1 || payload.amount_cny > 999999) {
    return '提现金额需在 1 元到 999999 元之间'
  }

  if (withdrawableBalance != null && payload.amount_cny > withdrawableBalance) {
    return '提现金额不能超过当前可提现余额'
  }

  if (payload.channel !== 'alipay' && payload.channel !== 'wechat') {
    return '收款方式仅支持支付宝或微信'
  }

  const accountName = payload.account_name.trim()
  if (accountName.length < 2 || accountName.length > 40) {
    return '收款人姓名长度需在 2 到 40 个字符之间'
  }

  const accountNo = payload.account_no.trim()
  if (accountNo.length < 6 || accountNo.length > 80) {
    return '收款账号长度需在 6 到 80 个字符之间'
  }

  const note = payload.note?.trim() ?? ''
  if (note.length > 200) {
    return '申请备注不能超过 200 个字符'
  }

  return null
}

export async function getDevWalletOverview(token: string): Promise<DevWalletOverview> {
  return requestJson<DevWalletOverview>(
    '/dev/requirements/wallet/overview',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载钱包失败',
  )
}

export async function getDevWithdrawalSummary(token: string): Promise<DevWithdrawalSummary> {
  return requestJson<DevWithdrawalSummary>(
    '/dev/payments/withdrawals',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载提现记录失败',
  )
}

export async function createDevWithdrawalRequest(
  token: string,
  payload: CreateDevWithdrawalRequest,
): Promise<DevWithdrawalRecord> {
  return requestJson<DevWithdrawalRecord>(
    '/dev/payments/withdrawals',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '提交提现申请失败',
  )
}