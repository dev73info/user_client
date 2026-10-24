import { authHeader, requestJson } from '@/api/http'

import type { RequirementItem } from './types'

export async function listRequirements(token: string): Promise<RequirementItem[]> {
  return requestJson<RequirementItem[]>(
    '/requirements/mine',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载需求失败',
  )
}

/**
 * 按需求编号读一条需求单详情（`GET /api/requirement/{requirement_id}`）。
 *
 * 读取可能触发服务端按需收口期限，返回的是收口后的最新状态。
 */
export async function fetchRequirementDetail(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载需求详情失败',
  )
}

export async function getWorkbenchRequirementHallItem(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  const normalizedRequirementId = requirementId.trim()
  const payload = await requestJson<RequirementItem[]>(
    '/dev/requirements/hall/query',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载需求详情失败',
  )
  const item = payload.find((requirement) => requirement.requirement_id === normalizedRequirementId)

  if (!item) {
    throw new Error('需求不存在或已不可接取')
  }

  return item
}
