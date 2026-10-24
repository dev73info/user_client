import { authHeader, requestJson } from '@/api/http'

import type { ContractDetail } from './types'

export async function fetchDeveloperAgreement(token: string): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    '/contracts/developer-agreement',
    { headers: authHeader(token) },
    '获取开发者入驻协议失败',
  )
}

export async function fetchApiUsageAgreement(token: string): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    '/contracts/api-usage-agreement',
    { headers: authHeader(token) },
    '获取接口使用协议失败',
  )
}
