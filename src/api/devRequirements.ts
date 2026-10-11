import { authHeader, requestJson } from '@/api/http'

export type RequirementStatus =
  | 'pending_review'
  | 'rejected'
  | 'pending_deposit'
  | 'deposit_paid'
  | 'in_development'
  | 'pending_final'
  // 尾款已缴、等渠道分账完成；分账成功后才转 `completed`。
  | 'pending_settlement'
  | 'completed'
  | 'cancelled'

export type RequirementPaymentMode = 'platform_guarantee' | 'self_managed'

export type RequirementItem = {
  id: number
  requirement_id: string
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
  resource_visibility?: 'public' | 'review' | 'private' | null
  created_time: string
  creator: string
  title: string
  budget?: number | null
  description?: string | null
  acceptance_criteria?: string | null
  /** 客户侧评价（需求创建者提交） */
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
  /** 开发者侧评价（绑定开发者提交） */
  developer_comment_rating?: number | null
  developer_comment_text?: string | null
  developer_commented_at?: string | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  updated_at: string
  /** 排队中分账里最晚的计划分账时间（东八区），没有排队分账时为空；前端据此算结算倒计时。 */
  settlement_available_at?: string | null
  /**
   * 开发周期（天，R014）：担保需求（`platform_guarantee`）创建 / 编辑时必填，
   * 等于合同自双方签署完成到截止的有效期天数；无担保需求或未填时为 `null`。
   */
  development_cycle_days?: number | null
  /** 进入「超期锁定」（合同有效期届满后的 30 天资料保留期）的时间（东八区）；从未锁定为 `null`。 */
  archive_locked_at?: string | null
  /** 锁定到期时间 = `archive_locked_at` + 平台配置的锁定期天数；未锁定为 `null`。 */
  archive_lock_expires_at?: string | null
  /** 内容被清除的时间（东八区）；非空即「已清除」终态：资料下载不可用、写操作一律拒绝。 */
  archive_cleared_at?: string | null
  /** 锁定期内是否该引导需求方「把交付资源转为我的资源」；由后端判定。 */
  archive_can_claim_resource?: boolean | null
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
