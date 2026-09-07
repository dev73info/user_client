import { authHeader, requestJson } from '@dev/api/http'
import type { ContractSigningStatus } from '@/shared/contracts'

export type { ContractSigningStatus } from '@/shared/contracts'

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
