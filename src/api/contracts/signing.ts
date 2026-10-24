import { authHeader, requestJson } from '@/api/http'
import type { ContractSigningStatus } from '@/shared/contracts'

import type { ContractDetail, SignContractInitiateResponse, SignContractPayload } from './types'

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

export async function fetchDevContractSigningStatus(
  token: string,
  requirementId: string,
): Promise<ContractSigningStatus> {
  return requestJson<ContractSigningStatus>(
    `/dev/contracts/signing-status/${encodeURIComponent(requirementId)}`,
    { headers: authHeader(token) },
    '获取合同签署状态失败',
  )
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

export async function initiateAsignSign(
  token: string,
  contractId: number,
  notice = false,
): Promise<SignContractInitiateResponse> {
  return requestJson<SignContractInitiateResponse>(
    `/contracts/${contractId}/asign-sign`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ notice }),
    },
    '发起爱签签署失败',
  )
}

/**
 * 用户端同步爱签签署状态到本地合同。
 *
 * 场景：用户已在爱签页面完成签署，但爱签回调可能延迟/丢失
 * （本地开发环境回调发到生产域名，本地收不到），导致本地合同仍停留在
 * 「签约中 1」。前端在签约页加载/轮询时调用本接口，主动向爱签查询签署状态，
 * 若爱签侧已完成则更新本地合同为已签署。
 */
export async function syncAsignSignStatus(
  token: string,
  contractId: number,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/${contractId}/asign-sync`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '同步签署状态失败',
  )
}

/**
 * 获取爱签合同预览链接（previewContract）。
 *
 * 合同已在爱签侧创建（已发起过签署）时返回预览链接，前端跳转即可查看
 * 签署完成后的合同样式；未发起或爱签异常时接口报错，调用方回退本地合同展示。
 */
export async function fetchAsignContractPreviewUrl(
  token: string,
  contractId: number,
): Promise<string> {
  const res = await requestJson<{ preview_url: string }>(
    `/contracts/${contractId}/asign/preview`,
    { headers: authHeader(token) },
    '获取合同预览失败',
  )
  return res.preview_url
}

/** 按需求获取爱签合同预览链接。 */
export async function fetchAsignRequirementPreviewUrl(
  token: string,
  requirementId: string,
): Promise<string> {
  const res = await requestJson<{ preview_url: string }>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/asign/preview`,
    { headers: authHeader(token) },
    '获取合同预览失败',
  )
  return res.preview_url
}
