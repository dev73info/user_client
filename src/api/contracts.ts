import { authHeader, requestJson } from '@/api/http'

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
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader() },
    '获取合同签署状态失败',
  )
}

export async function fetchMyRequirementContract(
  requirementId: string,
): Promise<ContractDetail | null> {
  const res = await fetch(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/my-contract`,
    { headers: authHeader() },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error('获取合同失败')
  return res.json() as Promise<ContractDetail>
}

export async function signContract(contractId: number): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/sign`,
    { method: 'POST', headers: authHeader() },
    '签署合同失败',
  )
}
