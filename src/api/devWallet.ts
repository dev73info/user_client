/**
 * 接单收入池的接口层：钱包总览、提现单、提现额度、自动出款门禁、冻结明细。
 *
 * 契约里这一域只有 `GET /api/requirement/wallet/overview` 与 `/api/payment/**` 这几条，
 * 全部按契约原样调用、原样返回：**不做 camelCase 投影，也不补契约没有的字段**
 * （此前这里补过 `withdrawable_balance_cny` 这类浮点元读数和一条预付保证金分支，
 * 两者在契约里都没有来源）。
 *
 * 金额一律整数分（`*_fen`）。只有 `DevWalletResponse` 这一条总览仍按契约给的是元（数值型），
 * 它只用于展示，不参与任何提现计算——提现金额与上限的来源是 `WithdrawalBalanceResponse`。
 */
import type { components } from '@/api/generated/schema'
import { authHeader, requestJson, requestVoid } from '@/api/http'
import { formatFenAsCny } from '@/shared/money'

type Schemas = components['schemas']

export type DevWalletIncomeItem = Schemas['DevIncomeResponse']
export type DevWalletOverview = Schemas['DevWalletResponse']
export type DevWithdrawalRecord = Schemas['WithdrawalResponse']
export type DevWithdrawalBalance = Schemas['WithdrawalBalanceResponse']
export type DevWithdrawalSetting = Schemas['WithdrawalSettingResponse']
export type CreateDevWithdrawalRequest = Schemas['WithdrawalRequest']
export type DevWithdrawalConfig = Schemas['WithdrawalConfig']
export type DevAutoPayoutRun = Schemas['AutoPayoutRunResponse']
export type DevFreezeDetailPage = Schemas['DepositFreezePageResponse']
export type DevFreezeDetailItem = Schemas['DepositFreezeItemResponse']

/** 提现单列表的查询参数：契约只支持按状态过滤与条数上限。 */
export type DevWithdrawalQuery = { status?: string; limit?: number }

/** 备注长度上限：后端按同一口径兜底校验（`WithdrawalRequest.note` 可选）。 */
export const WITHDRAW_NOTE_MAX_LEN = 200

export type WithdrawalValidationInput = {
  payload: CreateDevWithdrawalRequest
  /** 当前可提现（分）。不传则不校验上限，交给后端拦。 */
  withdrawableFen?: number | null
  /** 单笔上下限（分）：来自 `GET /api/payment/withdrawal-limits/system`，0 表示不设限。 */
  limits?: Pick<DevWithdrawalConfig, 'min_fen' | 'max_fen'> | null
}

/**
 * 提交前的本地校验：金额必须是大于 0 的整数分，且不超可提现与单笔上限。
 *
 * 只拦「必然失败」的输入，真正的扣减与门禁仍在后端；返回 null 表示可以提交。
 */
export function validateDevWithdrawalRequest(input: WithdrawalValidationInput): string | null {
  const amountFen = input.payload.amount_fen
  if (!Number.isSafeInteger(amountFen) || amountFen < 1) {
    return '提现金额须为大于 0 的整数分'
  }
  const minFen = input.limits?.min_fen ?? 0
  if (minFen > 0 && amountFen < minFen) {
    return `单笔提现不能少于 ¥${formatFenAsCny(minFen)}`
  }
  const maxFen = input.limits?.max_fen ?? 0
  if (maxFen > 0 && amountFen > maxFen) {
    return `单笔提现不能超过 ¥${formatFenAsCny(maxFen)}`
  }
  if (input.withdrawableFen != null && amountFen > input.withdrawableFen) {
    return '提现金额不能超过当前可提现余额'
  }
  if ((input.payload.note?.trim().length ?? 0) > WITHDRAW_NOTE_MAX_LEN) {
    return `申请备注不能超过 ${WITHDRAW_NOTE_MAX_LEN} 个字符`
  }
  return null
}

/** 钱包总览：接单收入池的累计 / 今日 / 可提现读数与最近到账。 */
export async function getDevWalletOverview(token: string): Promise<DevWalletOverview> {
  return requestJson<DevWalletOverview>(
    '/requirement/wallet/overview',
    { headers: authHeader(token) },
    '加载钱包失败',
  )
}

/** 提现额度（分）：收入、已提、可提三个数就是提现金额的上限来源。 */
export async function getDevWithdrawalBalance(token: string): Promise<DevWithdrawalBalance> {
  return requestJson<DevWithdrawalBalance>(
    '/payment/withdrawals/balance',
    { headers: authHeader(token) },
    '加载提现额度失败',
  )
}

/** 我的提现单（最新在前）。 */
export async function listDevWithdrawals(
  token: string,
  query: DevWithdrawalQuery = {},
): Promise<DevWithdrawalRecord[]> {
  const params = new URLSearchParams()
  const status = query.status?.trim()
  if (status) {
    params.set('status', status)
  }
  if (query.limit != null) {
    params.set('limit', String(query.limit))
  }
  const search = params.toString()
  return requestJson<DevWithdrawalRecord[]>(
    `/payment/withdrawals${search ? `?${search}` : ''}`,
    { headers: authHeader(token) },
    '加载提现记录失败',
  )
}

/**
 * 删除一张提现单（204，无响应体）。
 *
 * 后端只允许删「钱还没动过」的单（待审核 / 已驳回），其余回 409 并说明该先做什么；
 * 前端不自己猜状态，后端的原因原样转达。
 */
export async function deleteDevWithdrawal(token: string, withdrawalId: string): Promise<void> {
  return requestVoid(
    `/payment/withdrawals/${encodeURIComponent(withdrawalId)}`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
    '删除提现申请失败',
  )
}

/** 申请提现：只发整数分与备注，收款账户取账号中心绑定的那一张。 */
export async function createDevWithdrawalRequest(
  token: string,
  payload: CreateDevWithdrawalRequest,
): Promise<DevWithdrawalRecord> {
  return requestJson<DevWithdrawalRecord>(
    '/payment/withdrawals',
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

/** 自动出款门禁开关：关着（默认）时提现一律进人工审核，不是「每天批量打款」。 */
export async function getDevWithdrawalSetting(token: string): Promise<DevWithdrawalSetting> {
  return requestJson<DevWithdrawalSetting>(
    '/payment/withdrawal-setting',
    { headers: authHeader(token) },
    '加载自动提现设置失败',
  )
}

export async function updateDevWithdrawalSetting(
  token: string,
  autoWithdrawEnabled: boolean,
): Promise<DevWithdrawalSetting> {
  return requestJson<DevWithdrawalSetting>(
    '/payment/withdrawal-setting',
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

/** 提现限额配置（分）：`auto_payout_max_fen = 0` 表示不限额。 */
export async function getDevWithdrawalConfig(token: string): Promise<DevWithdrawalConfig> {
  return requestJson<DevWithdrawalConfig>(
    '/payment/withdrawal-limits/system',
    { headers: authHeader(token) },
    '加载提现限额失败',
  )
}

/** 冻结明细（接单保证金的冻结 / 已释放 / 已扣划）：按需求或状态查。 */
export async function getDevFreezeDetails(
  token: string,
  query: { developer?: string; status?: string; requirement_id?: string; limit?: number } = {},
): Promise<DevFreezeDetailPage> {
  const params = new URLSearchParams()
  for (const key of ['developer', 'status', 'requirement_id'] as const) {
    const value = query[key]?.trim()
    if (value) {
      params.set(key, value)
    }
  }
  if (query.limit != null) {
    params.set('limit', String(query.limit))
  }
  const search = params.toString()
  return requestJson<DevFreezeDetailPage>(
    `/payment/freeze-details${search ? `?${search}` : ''}`,
    { headers: authHeader(token) },
    '加载冻结明细失败',
  )
}
