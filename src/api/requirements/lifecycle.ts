import { authHeader, requestJson } from '@/api/http'

import type { CommentRequirementPayload, CreateRequirementPayload, RequirementItem } from './types'

export async function createRequirement(
  token: string,
  payload: CreateRequirementPayload,
): Promise<void> {
  await requestJson<unknown>(
    '/requirements/',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发布失败',
  )
}

export async function commentRequirement(
  token: string,
  requirementId: string,
  payload: CommentRequirementPayload,
): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/comment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '评论失败',
  )
}

export async function requestRequirementFinalPayment(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}/request-final-payment`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '结束开发失败',
  )
}

/** 开发者催告客户支付尾款（只通知，不动钱）。 */
export async function requestRequirementFinalPayCure(
  token: string,
  requirementId: string,
): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/final-pay-cure`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '催告付款失败',
  )
}

export async function resubmitRequirement(
  token: string,
  requirementId: string,
  payload: CreateRequirementPayload,
): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/resubmit`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '重新提交失败',
  )
}

export async function cancelRequirement(token: string, requirementId: string): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/cancel`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '取消需求失败',
  )
}
