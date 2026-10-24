import { authHeader, requestJson } from '@/api/http'

import type { RequirementItem } from './requirements'

export type {
  RequirementItem,
  RequirementPaymentMode,
  RequirementStatus,
} from './requirements'

/**
 * 需求大厅的候选单（契约 `GET /api/requirement/hall/query`）。
 *
 * 这条接口**不收查询参数**、一次回全量数组；关键词、排序与分页都在前端做（见
 * `composables/useDevRequirementHall.ts`）。别照搬管理端那套 `page / page_size / keyword`
 * 往这里塞——参数会被忽略，前端若还按「服务端已过滤」去渲染就会露馅。
 */
export async function listRequirementHall(token: string): Promise<RequirementItem[]> {
  return requestJson<RequirementItem[]>(
    '/dev/requirements/hall/query',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源关联列表失败',
  )
}

export async function getRequirementHallItem(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  const normalizedRequirementId = requirementId.trim()
  const payload = await listRequirementHall(token)
  const item = payload.find(
    (requirement) => requirement.requirement_id === normalizedRequirementId,
  )

  if (!item) {
    throw new Error('需求不存在或已不可接取')
  }

  return item
}

/**
 * 接单 / 关联资源（契约 `POST /api/requirement/{requirement_id}/bind-project`）。
 *
 * 请求体只有 `resource_id`（契约是 `integer | null`）：传 `null` 表示只接单、不关联资源。
 * 担保单会在这里按需求预算冻结接单保证金，余额不足、未签入驻协议、已被别人接走等情况
 * 后端回 403/409 并带中文说明，调用方照实转达即可。
 */
export async function bindRequirementProject(
  token: string,
  requirementId: string,
  resourceId: number | null,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/dev/requirements/${encodeURIComponent(requirementId)}/bind-project`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ resource_id: resourceId }),
    },
    '关联需求失败',
  )
}

/** 我接的单（契约 `GET /api/requirement/dev/mine`）。 */
export async function listMyRequirements(token: string): Promise<RequirementItem[]> {
  return requestJson<RequirementItem[]>(
    '/dev/requirements/mine',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载我的需求单失败',
  )
}
