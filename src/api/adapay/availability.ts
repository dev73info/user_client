import { authHeader, requestJson } from '@/api/http'

import type { AdapayAvailability } from './types'

/**
 * 查询电签担保是否可用（需 Adapay 密钥、回调地址、个税规则等配置齐备）。
 * 公开接口；带上令牌时后端会按当前用户是否拥有「电签担保测试」权限
 * 返回 `escrowAllowed`（线上灰度期间仅对测试角色开放）。
 */
export async function getAdapayAvailability(token?: string): Promise<AdapayAvailability> {
  return requestJson<AdapayAvailability>(
    '/adapay/availability',
    { method: 'GET', headers: token ? authHeader(token) : undefined },
    '查询支付渠道可用性失败',
  )
}
