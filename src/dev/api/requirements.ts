import { authHeader, requestJson } from '@dev/api/http'

export type RequirementStatus =
  | 'pending_review'
  | 'rejected'
  | 'pending_deposit'
  | 'deposit_paid'
  | 'in_development'
  | 'pending_final'
  | 'final_paid'
  | 'completed'

export type RequirementPaymentMode = 'platform_guarantee' | 'self_managed'

export type RequirementItem = {
  id: number
  requirement_id: string
  bound_resource_id?: number | null
  resource_visibility?: 'public' | 'private' | null
  created_time: string
  creator: string
  title: string
  budget?: number | null
  description?: string | null
  acceptance_criteria?: string | null
  payment_method?: string | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  updated_at: string
}

export type RequirementPageResp = {
  total: number
  page: number
  page_size: number
  items: RequirementItem[]
}

export type RequirementHallQuery = {
  page?: number
  pageSize?: number
  keyword?: string
  creator?: string
  sortBy?: 'created_time' | 'updated_at' | 'budget'
  sortOrder?: 'asc' | 'desc'
}

export async function listRequirementHall(
  token: string,
  query: RequirementHallQuery,
): Promise<RequirementPageResp> {
  const params = new URLSearchParams()

  if (query.page) {
    params.set('page', String(query.page))
  }
  if (query.pageSize) {
    params.set('page_size', String(query.pageSize))
  }
  if (query.keyword?.trim()) {
    params.set('keyword', query.keyword.trim())
  }
  if (query.creator?.trim()) {
    params.set('creator', query.creator.trim())
  }
  if (query.sortBy) {
    params.set('sort_by', query.sortBy)
  }
  if (query.sortOrder) {
    params.set('sort_order', query.sortOrder)
  }

  const suffix = params.toString()
  const path = suffix ? `/dev/requirements/hall/query?${suffix}` : '/dev/requirements/hall/query'

  return requestJson<RequirementPageResp>(
    path,
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
  const payload = await listRequirementHall(token, {
    page: 1,
    pageSize: 20,
    keyword: normalizedRequirementId,
    sortBy: 'updated_at',
    sortOrder: 'desc',
  })
  const item = payload.items.find(
    (requirement) => requirement.requirement_id === normalizedRequirementId,
  )

  if (!item) {
    throw new Error('需求不存在或已不可接取')
  }

  return item
}

export async function bindRequirementProject(
  token: string,
  requirementId: string,
  resourceId: number,
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
