import { apiUrl, authHeader, requestJson } from '@/api/http'

export type ContractSigningStatus = {
  has_contract: boolean
  party_b_signed: boolean
  party_a_signed: boolean
}

export type ContractDetail = {
  id: number
  contract_no: string
  title: string
  content: string
  status: string
  party_a_name: string
  party_a_username: string
  party_a_signed_at: string | null
  party_b_name: string
  party_b_username: string
  party_b_signed_at: string | null
  created_at: string
}

export async function fetchContractSigningStatus(
  token: string,
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader(token) },
    '获取合同签署状态失败',
  )
}

export async function fetchMyRequirementContract(
  token: string,
  requirementId: string,
): Promise<ContractDetail | null> {
  const res = await fetch(
    apiUrl(`/contracts/requirement/${encodeURIComponent(requirementId)}/my-contract`),
    { headers: authHeader(token) },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('获取合同失败')
  return res.json() as Promise<ContractDetail>
}

export async function signContract(token: string, contractId: number): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/sign`,
    { method: 'POST', headers: authHeader(token) },
    '签署合同失败',
  )
}
