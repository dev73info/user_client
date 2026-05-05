import { authHeader, requestJson } from '@dev/api/http'

export type ContractSigningStatus = {
  has_contract: boolean
  party_b_signed: boolean
  party_a_signed: boolean
}

export async function fetchContractSigningStatus(
  token: string,
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/dev/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader(token) },
    '获取合同签署状态失败',
  )
}
