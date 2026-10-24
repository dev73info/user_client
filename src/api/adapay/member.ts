import { authHeader, requestJson } from '@/api/http'

import type {
  AdapayMemberStatus,
  MySettlementAccountPayload,
  MySettlementAccountSnapshot,
} from './types'

export async function getMyAdapayMember(token: string): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载 Adapay 认证状态失败',
  )
}

export async function getMySettlementAccountSnapshot(
  token: string,
): Promise<MySettlementAccountSnapshot> {
  return requestJson<MySettlementAccountSnapshot>(
    '/adapay/me/settle-account',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载收款银行卡信息失败',
  )
}

export async function createMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountPayload,
): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '设置 Adapay 结算账户失败',
  )
}

/**
 * 注销（解绑）已绑定的结算账户。
 *
 * 破坏性动作：注销后合同款与分账都进不来，要收款必须重新绑定银行卡。
 * 后端会先打渠道删除接口，成功后才清空本地绑定；渠道拒绝时本地保持原样并抛错。
 */
export async function closeMyAdapaySettlementAccount(token: string): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account/close',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '注销结算账户失败',
  )
}

/**
 * 更换已绑定的结算账户（收款银行卡）。
 *
 * 渠道侧不支持直接改卡，后端会先解绑旧卡再用新的银行卡信息重建，
 * 因此这个请求可能失败在「已解绑、未重建」的中间态上；调用方失败后应重新查询
 * `getMyAdapayMember` 确认真实绑定状态。
 */
export async function changeMyAdapaySettlementAccount(
  token: string,
  payload: MySettlementAccountPayload,
): Promise<AdapayMemberStatus> {
  return requestJson<AdapayMemberStatus>(
    '/adapay/me/settle-account/change',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更换 Adapay 结算账户失败',
  )
}
