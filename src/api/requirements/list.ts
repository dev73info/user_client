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
 * 权限：需求创建者本人、或绑定的开发者都能读（后端 `get_requirement_detail_for_operator`）。
 * **读取本身就是「访问触发」**：合同有效期届满的担保需求会在这一次读里被收口成
 * 锁定 / 清除态，所以返回的 `archive_*` 字段就是最新状态。合同页（`ContractSignView`）
 * 用它拿锁定 / 清除标记，不必再单独设计接口。
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
  const params = new URLSearchParams({
    page: '1',
    page_size: '20',
    keyword: normalizedRequirementId,
    sort_by: 'updated_at',
    sort_order: 'desc',
  })
  const payload = await requestJson<{ items: RequirementItem[] }>(
    `/dev/requirements/hall/query?${params.toString()}`,
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载需求详情失败',
  )
  const item = payload.items.find(
    (requirement) => requirement.requirement_id === normalizedRequirementId,
  )

  if (!item) {
    throw new Error('需求不存在或已不可接取')
  }

  return item
}
