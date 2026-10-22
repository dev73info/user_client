import { authHeader, requestJson, requestVoid } from '@/api/http'

import type { ContractDetail, DraftContractAttachmentPayload } from './types'

/**
 * 由需求方或已接单开发者主动发起《需求开发合同》。
 * 接单不再自动建合同，双方任一当事人均可发起（幂等）。
 */
export async function createRequirementContract(
  token: string,
  requirementId: string,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    },
    '发起合同失败',
  )
}

/* ------------------------------------------------------------------ 自定义合同附件 */

/**
 * 上传自定义合同附件（方案 A）。
 *
 * 挂在该需求**已有生效合同行**上（附件不单独建合同）：需求还没发起合同时后端返回 409「请先发起合同」；
 * 只收 pdf / doc / docx；发起爱签签署之后（`asign_contract_no` 非空）再上传返回 409「需作废重签」。
 * 任意一次上传/拟定都会把审核态重置为「待审核」——不允许沿用旧放行。
 */
export async function uploadContractAttachment(
  token: string,
  requirementId: string,
  file: File,
): Promise<ContractDetail> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/attachment`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传合同附件失败',
  )
}

/**
 * 在页面内拟定条款并由平台渲染成附件（方案 B）。
 *
 * 与上传共用同一组字段与同一个审核状态机：一笔合同只有一份附件，拟定与上传互相覆盖。
 */
export async function draftContractAttachment(
  token: string,
  requirementId: string,
  payload: DraftContractAttachmentPayload,
): Promise<ContractDetail> {
  return requestJson<ContractDetail>(
    `/contracts/requirement/${encodeURIComponent(requirementId)}/attachment/draft`,
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '提交合同条款失败',
  )
}

/**
 * 撤回自定义合同附件。
 *
 * 与上传同一道边界：只在渠道合同尚未创建（`asign_contract_no IS NULL`）时允许；
 * 撤回后 `content_source` 回 `platform`、附件字段清空、审核态回 `none`。
 */
export async function deleteContractAttachment(token: string, contractId: number): Promise<void> {
  await requestVoid(
    `/contracts/${contractId}/attachment`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
    '撤回合同附件失败',
  )
}
