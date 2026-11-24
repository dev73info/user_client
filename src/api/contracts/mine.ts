import { apiUrl, authHeader, requestJson } from '@/api/http'

import type { ContractDetail, MyContractSummary, SigningLogItem } from './types'

export function listMyContracts(token: string): Promise<MyContractSummary[]> {
  return requestJson<MyContractSummary[]>(
    '/contracts/mine',
    { headers: authHeader(token) },
    '获取我的合同失败',
  )
}

export function fetchMyContract(token: string, contractId: number): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/mine/${contractId}`,
    { headers: authHeader(token) },
    '获取合同详情失败',
  )
}

/** 当事人读取自己合同的签署流水（只读；非当事人后端按 404 处理）。 */
export function fetchMyContractSigningLogs(
  token: string,
  contractId: number,
): Promise<SigningLogItem[]> {
  return requestJson<SigningLogItem[]>(
    `/contracts/mine/${contractId}/signing-logs`,
    { headers: authHeader(token) },
    '获取签署记录失败',
  )
}

export async function fetchMyRequirementContract(
  token: string,
  requirementId: string,
): Promise<ContractDetail | null> {
  const res = await fetch(
    apiUrl(`/contracts/requirement/${encodeURIComponent(requirementId)}/my-contract`),
    { headers: authHeader(token), credentials: 'omit' },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('获取合同失败')
  return res.json() as Promise<ContractDetail>
}
