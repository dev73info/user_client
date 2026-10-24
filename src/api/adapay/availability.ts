import { authHeader, requestJson } from '@/api/http'

import type { AdapayAvailability } from './types'

/** 查询当前支付通道是否可发起真实支付。 */
export async function getAdapayAvailability(token?: string): Promise<AdapayAvailability> {
  return requestJson<AdapayAvailability>(
    '/payment/availability',
    { method: 'GET', headers: token ? authHeader(token) : undefined },
    '查询支付渠道可用性失败',
  )
}
