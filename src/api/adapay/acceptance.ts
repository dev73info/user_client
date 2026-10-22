import { authHeader, requestJson } from '@/api/http'

import type {
  AdapayAcceptanceRecord,
  AdapayAcceptanceResponse,
  AdapayAcceptanceResult,
} from './types'

export async function acceptAdapayDelivery(
  token: string,
  requirementId: string,
  result: AdapayAcceptanceResult = 'passed',
  note = '',
): Promise<AdapayAcceptanceResponse> {
  return requestJson<AdapayAcceptanceResponse>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/accept`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ result, note }),
    },
    '提交验收结果失败',
  )
}

/** 查询需求的验收留档（验收可重复提交，按时间倒序）。 */
export async function listAdapayAcceptances(
  token: string,
  requirementId: string,
): Promise<AdapayAcceptanceRecord[]> {
  return requestJson<AdapayAcceptanceRecord[]>(
    `/adapay/requirements/${encodeURIComponent(requirementId)}/acceptances`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载验收记录失败',
  )
}
