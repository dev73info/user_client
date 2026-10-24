import { authHeader, requestJson } from '@/api/http'

import type { CommentRequirementPayload, CreateRequirementPayload, RequirementItem } from './types'

export async function createRequirement(
  token: string,
  payload: CreateRequirementPayload,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    '/requirements',
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
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
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

export async function submitRequirementDelivery(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}/deliver`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '提交需求交付失败',
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

/**
 * 重新提交被驳回的需求。
 *
 * **两步，缺一不可**：契约里 `PATCH /{requirement_id}` 才是「保存修改」，而
 * `PATCH /{requirement_id}/resubmit` 只做 `rejected → pending_review` 的状态流转（**不收请求体**，
 * 后端 handler 根本不读 body）。早先这里把修改内容直接塞给 `resubmit`，后端收下后原样丢弃，
 * 用户改的标题 / 预算 / 周期全部落不了库，而接口回 200——最难发现的那种「看起来成功了」。
 */
export async function resubmitRequirement(
  token: string,
  requirementId: string,
  payload: CreateRequirementPayload,
): Promise<RequirementItem> {
  const path = `/requirements/${encodeURIComponent(requirementId)}`
  await requestJson<RequirementItem>(
    path,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '保存修改失败',
  )

  return requestJson<RequirementItem>(
    `${path}/resubmit`,
    {
      method: 'PATCH',
      headers: {
        ...authHeader(token),
      },
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
