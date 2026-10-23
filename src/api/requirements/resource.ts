import { authHeader, requestJson } from '@/api/http'

import type {
  RequirementItem,
  ReviewRequirementResourceDeletePayload,
  UpdateRequirementResourceVisibilityPayload,
} from './types'

/**
 * 把已结单需求的交付资源转为需求方自己的资源（一次性、不可撤销）。
 *
 * 只有需求创建者本人能调；成功返回转换后的完整需求行（`resource_claimed_at` 有值）。
 * 副作用：该需求的会话转为 `closed`（仅可查看），需求方若无 `dev` 角色会被补上——调用方要跟着刷新角色。
 * 失败时后端以 text/plain 回可直接展示的中文文案（409 的几种前置各不相同），`HttpError.message` 即为该文案。
 */
export async function claimRequirementResource(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}/claim-resource`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '转为我的资源失败',
  )
}

export async function updateRequirementResourceVisibility(
  token: string,
  requirementId: string,
  payload: UpdateRequirementResourceVisibilityPayload,
): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/resource-visibility`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新资源可见性失败',
  )
}

export async function reviewRequirementResourceDelete(
  token: string,
  requirementId: string,
  payload: ReviewRequirementResourceDeletePayload,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}/resource-delete-review`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '审核资源删除失败',
  )
}
