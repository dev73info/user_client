import { authHeader, requestJson } from '@/api/http'

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
  status: 'pending_review' | 'approved' | 'payout_processing' | 'payout_failed' | 'rejected' | 'paid'
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

export type DevWithdrawalLimits = {
  min_amount_cny: number
  max_amount_cny: number
  alipay_enabled: boolean
  wechat_enabled: boolean
  account_name_min_len: number
  account_name_max_len: number
  account_no_min_len: number
  account_no_max_len: number
  note_max_len: number
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
  limits?: DevWithdrawalLimits | null,
  allowEmptyWechatAccount = false,
): string | null {
  const minAmount = limits?.min_amount_cny ?? 0.01
  const maxAmount = limits?.max_amount_cny ?? 999999
  const normalizedAmount = Math.round(payload.amount_cny * 100) / 100
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < minAmount || normalizedAmount > maxAmount) {
    return `提现金额需在 ${minAmount.toFixed(2)} 元到 ${maxAmount.toFixed(2)} 元之间，最多保留两位小数`
  }

  if (withdrawableBalance != null && normalizedAmount > withdrawableBalance) {
    return '提现金额不能超过当前可提现余额'
  }

  if (payload.channel !== 'alipay' && payload.channel !== 'wechat') {
    return '收款方式仅支持支付宝或微信'
  }

  if (payload.channel === 'alipay' && limits && !limits.alipay_enabled) {
    return '当前未启用支付宝提现'
  }
  if (payload.channel === 'wechat' && limits && !limits.wechat_enabled) {
    return '当前未启用微信提现'
  }

  const accountName = payload.account_name.trim()
  const accountNameMin = limits?.account_name_min_len ?? 2
  const accountNameMax = limits?.account_name_max_len ?? 40
  if (accountName.length < accountNameMin || accountName.length > accountNameMax) {
    return `收款人姓名长度需在 ${accountNameMin} 到 ${accountNameMax} 个字符之间`
  }

  const accountNo = payload.account_no.trim()
  const accountNoMin = limits?.account_no_min_len ?? 6
  const accountNoMax = limits?.account_no_max_len ?? 80
  const canUseBoundWechatAccount = allowEmptyWechatAccount && payload.channel === 'wechat'
  if ((!canUseBoundWechatAccount && accountNo.length < accountNoMin) || accountNo.length > accountNoMax) {
    return `收款账号长度需在 ${accountNoMin} 到 ${accountNoMax} 个字符之间`
  }

  const note = payload.note?.trim() ?? ''
  const noteMax = limits?.note_max_len ?? 200
  if (note.length > noteMax) {
    return `申请备注不能超过 ${noteMax} 个字符`
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

export async function getDevWithdrawalLimits(token: string): Promise<DevWithdrawalLimits> {
  return requestJson<DevWithdrawalLimits>(
    '/dev/payments/withdrawal-limits',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载提现配置失败',
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
