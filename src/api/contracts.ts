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
  content_sha256: string
  status: string
  party_a_name: string
  party_a_username: string | null
  party_a_account_email?: string | null
  party_a_real_name?: string | null
  party_a_id_card_no_masked?: string | null
  party_a_signature_sha256?: string | null
  party_a_signed_at: string | null
  party_b_name: string
  party_b_username: string | null
  party_b_account_email?: string | null
  party_b_real_name?: string | null
  party_b_id_card_no_masked?: string | null
  party_b_signature_sha256?: string | null
  party_b_signed_at: string | null
  created_by?: string
  created_at: string
  updated_at?: string
  signing_logs?: SigningLogItem[]
}

export type SigningLogItem = {
  id: number
  contract_id: number
  contract_no: string
  contract_title: string
  action: string
  from_status?: string | null
  to_status?: string | null
  operator: string
  signer_party?: string | null
  signer_real_name?: string | null
  signer_id_card_no_masked?: string | null
  signer_username?: string | null
  signer_email?: string | null
  handwritten_signature?: string | null
  signature_sha256?: string | null
  note?: string | null
  created_at: string
}

export type SignContractPayload = {
  handwritten_signature: string
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

export async function signContract(
  token: string,
  contractId: number,
  payload: SignContractPayload,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/sign`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '签署合同失败',
  )
}
