import type { components } from '@/api/generated/schema'
import { authHeader, requestJson } from '@/api/http'

import type {
  AdapayMemberStatus,
  MySettlementAccountChangePayload,
  MySettlementAccountPayload,
  MySettlementAccountSnapshot,
} from './types'

type SettlementAccount = components['schemas']['SettlementAccountResponse']

/**
 * 结算账户契约适配：`/api/payment/settlement-account*` 这几条端点的响应统一是
 * `SettlementAccountResponse`，这里只把它折成用户端的读数形状（camelCase），
 * **不补契约没有的字段**（渠道会员号 / 结算账户号 / 渠道状态原文都不编）。
 */
function toMemberStatus(account: SettlementAccount): AdapayMemberStatus {
  return {
    username: account.username,
    memberType: account.member_type,
    accountName: account.account_name,
    bankName: account.bank_name,
    accountNoTail: account.account_no_tail,
    onboardingStatus: account.status,
    statusLabel: account.status_label,
    reviewNote: account.review_note,
    providerError: account.provider_error,
    acceptsSettlement: account.accepts_settlement,
    updatedTime: account.updated_time,
  }
}

/**
 * 回填用的脱敏快照。
 *
 * 契约只给后四位，所以 `accountNoTail` 就是唯一能回显的卡号信息，
 * 弹窗的提示文案据此写「当前尾号 xxxx」。
 */
function toSnapshot(account: SettlementAccount): MySettlementAccountSnapshot {
  return {
    bound: account.accepts_settlement === true,
    accountName: account.account_name,
    bankName: account.bank_name,
    accountNoTail: account.account_no_tail,
    memberType: account.member_type,
  }
}

/**
 * 读自己的结算账户。
 *
 * 没开过户时后端正常返回 `null`（「还没开户」是常态，不是 404），这里如实透成 `null`；
 * 请求失败照实抛错，由调用方把原因报出来。
 */
export async function getMyAdapayMember(token: string): Promise<AdapayMemberStatus | null> {
  const account = await requestJson<SettlementAccount | null>(
    '/payment/settlement-account',
    { headers: authHeader(token) },
    '加载结算账户状态失败',
  )
  return account ? toMemberStatus(account) : null
}

export async function getMySettlementAccountSnapshot(
  token: string,
): Promise<MySettlementAccountSnapshot | null> {
  const account = await requestJson<SettlementAccount | null>(
    '/payment/settlement-account',
    { headers: authHeader(token) },
    '加载结算账户信息失败',
  )
  return account ? toSnapshot(account) : null
}

/** 首次提交开户资料：只收户名 / 开户行 / 卡号后四位，完整卡号平台不留。 */
export async function createMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountPayload,
): Promise<AdapayMemberStatus> {
  const account = await requestJson<SettlementAccount>(
    '/payment/settlement-account',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '提交结算账户资料失败',
  )
  return toMemberStatus(account)
}

/** 注销（解绑）结算账户：行不删，只置 `closed`，历史分账与提现单上仍印着当时的账户。 */
export async function closeMyAdapaySettlementAccount(token: string): Promise<AdapayMemberStatus> {
  const account = await requestJson<SettlementAccount>(
    '/payment/settlement-account/close',
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '注销结算账户失败',
  )
  return toMemberStatus(account)
}

/** 已开通状态下改绑：与提交开户资料同一套字段，同样是后四位。 */
export async function changeMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountChangePayload,
): Promise<AdapayMemberStatus> {
  const account = await requestJson<SettlementAccount>(
    '/payment/settlement-account/change',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更换结算账户失败',
  )
  return toMemberStatus(account)
}

/** 回查渠道状态：渠道侧开户结果变化后由用户或平台触发一次同步。 */
export async function syncMyAdapaySettlementAccount(token: string): Promise<AdapayMemberStatus> {
  const account = await requestJson<SettlementAccount>(
    '/payment/settlement-account/sync',
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '同步结算账户状态失败',
  )
  return toMemberStatus(account)
}
