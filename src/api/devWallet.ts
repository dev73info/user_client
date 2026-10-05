import { authHeader, requestJson } from '@/api/http'

export type DevWalletIncomeItem = {
  payment_id: string
  requirement_id: string
  title: string
  customer: string
  /** 该里程碑分账**到账**多少（历史事实，不因后来的售后退款改写）。 */
  gross_amount_cny: number
  /** 售后按原分账份额从开发者处**收回**多少；未发生退款时为 0。 */
  refund_developer_cny: number
  /** 开发者**实际留下**多少 = `gross_amount_cny - refund_developer_cny`（可提现口径）。 */
  amount_cny: number
  paid_at: string
  requirement_status: string
  /** 收回发生的时间；未发生退款时为 null。 */
  refunded_at: string | null
  /**
   * 该需求**累计退还给客户**多少（含平台按服务费承担的部分）。
   *
   * 与 `refund_developer_cny` 不是一回事：那个是「从开发者这里收回的份额」，
   * 这个是「客户实收」。已结单需求的退款通常两者不相等，界面上要分开说。
   */
  requirement_refund_cny: number
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
  /** 出款渠道：接单收入与保证金退回都经 Adapay 出款，alipay / wechat 是历史数据的兼容取值 */
  channel: 'adapay' | 'alipay' | 'wechat'
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
  /** 出款失败原因；出款中与已出款时为空 */
  payout_failure_message?: string | null
  payout_started_at?: string | null
  payout_attempts?: number
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
  channel: 'alipay' | 'wechat' | 'adapay'
  account_name: string
  account_no: string
  note?: string | null
}

/** 收益提现偏好与出款通道状态（自动提现开关 + T+1 到账说明）。 */
export type DevWithdrawalSetting = {
  auto_withdraw_enabled: boolean
  auto_withdraw_enabled_at?: string | null
  payout_channel_ready: boolean
  payout_channel_message?: string | null
  payout_schedule_note: string
  payout_account_no?: string | null
}

export function validateDevWithdrawalRequest(
  payload: CreateDevWithdrawalRequest,
  withdrawableBalance?: number | null,
  limits?: DevWithdrawalLimits | null,
  allowEmptyWechatAccount = false,
  source: 'income' | 'developer_order_deposit' = 'income',
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

  if (payload.channel !== 'alipay' && payload.channel !== 'wechat' && payload.channel !== 'adapay') {
    return '收款方式仅支持支付宝或微信'
  }

  const note = payload.note?.trim() ?? ''
  const noteMax = limits?.note_max_len ?? 200
  if (note.length > noteMax) {
    return `申请备注不能超过 ${noteMax} 个字符`
  }
  if (source === 'developer_order_deposit') {
    return payload.channel === 'adapay' ? null : '保证金需通过原充值订单退回'
  }

  // 收益提现的出款由服务端按「开发者已绑定的 Adapay 收款账户」补全，前端不再采集收款信息，
  // 因此这里只校验金额与备注。
  if (source === 'income') {
    return null
  }

  if (payload.channel === 'adapay') {
    if (!payload.account_name.trim()) {
      return '请填写收款户名：个人为实名姓名，企业为认证企业全称'
    }
    return null
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

/** 读取收益提现偏好：自动提现开关、出款通道状态与 T+1 到账说明。 */
export async function getDevWithdrawalSetting(token: string): Promise<DevWithdrawalSetting> {
  return requestJson<DevWithdrawalSetting>(
    '/dev/payments/withdrawal-setting',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载自动提现设置失败',
  )
}

/** 开启或关闭收益自动提现（开启前必须在账号中心绑定 Adapay 收款银行卡）。 */
export async function updateDevWithdrawalSetting(
  token: string,
  autoWithdrawEnabled: boolean,
): Promise<DevWithdrawalSetting> {
  return requestJson<DevWithdrawalSetting>(
    '/dev/payments/withdrawal-setting',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ auto_withdraw_enabled: autoWithdrawEnabled }),
    },
    autoWithdrawEnabled ? '开启自动提现失败' : '关闭自动提现失败',
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
