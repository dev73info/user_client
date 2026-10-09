import { authHeader, requestJson } from '@/api/http'
import type { McResourceTagSelectionPayload, McResourcePlatform } from '@/api/resources'

export type RecentDeal = {
  payment_id: string
  requirement_id: string
  title: string
  amount_cny: number
  paid_at: string
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
}

export type RequirementOverviewResp = {
  developer_count?: number
  total_orders: number
  total_orders_change_rate: number
  positive_rate: number
  positive_rate_change_rate: number
  total_turnover_cny: number
  total_turnover_change_rate: number
  recent_deals: RecentDeal[]
}

export type PublicRequirementSpotlightItem = {
  requirement_id: string
  creator?: string
  title: string
  description?: string | null
  acceptance_criteria?: string | null
  budget?: number | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  created_at: string
  updated_at: string
}

export type PublicRequirementSpotlightPage = {
  total: number
  page: number
  page_size: number
  items: PublicRequirementSpotlightItem[]
}

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

export type RequirementPendingResourceVersionDeleteRequest = {
  version_id: number
  version: string
  requested_at?: string | null
}

export type RequirementItem = {
  id: number
  requirement_id: string
  subscribe_status_change: boolean
  bound_resource_id?: number | null
  bound_resource_version_count?: number | null
  resource_visibility?: 'public' | 'review' | 'private' | null
  resource_version_delete_request_id?: number | null
  resource_version_delete_request_version?: string | null
  resource_version_delete_request_status?: 'pending' | 'rejected' | null
  resource_version_delete_requested_at?: string | null
  resource_version_delete_reviewed_at?: string | null
  resource_version_delete_review_note?: string | null
  pending_resource_version_delete_requests?: RequirementPendingResourceVersionDeleteRequest[] | null
  bound_resource_platform?: McResourcePlatform | null
  bound_resource_title?: string | null
  bound_resource_author?: string | null
  bound_resource_description?: string | null
  bound_resource_tag_selections?: McResourceTagSelectionPayload[] | null
  bound_resource_source_url?: string | null
  bound_resource_cover_url?: string | null
  bound_resource_docs_url?: string | null
  bound_resource_updated_at?: string | null
  created_time?: string
  creator?: string
  title: string
  description?: string | null
  acceptance_criteria?: string | null
  review_note?: string | null
  /** 客户侧评价（需求创建者提交） */
  comment_rating?: number | null
  comment_text?: string | null
  commented_at?: string | null
  /** 开发者侧评价（绑定开发者提交） */
  developer_comment_rating?: number | null
  developer_comment_text?: string | null
  developer_commented_at?: string | null
  status: RequirementStatus
  budget?: number | null
  payment_mode: RequirementPaymentMode
  updated_at: string
  developer?: string | null
  /** 排队中分账里最晚的计划分账时间（东八区），没有排队分账时为空；前端据此算结算倒计时。 */
  settlement_available_at?: string | null
  /**
   * 交付资源转为需求方自己资源的时间（`YYYY-MM-DD HH:mm:ss`，北京时间）；未转换为 `null`。
   * 有值即「已转为我的资源」：入口隐藏、会话已关闭、`bound_resource_author` 变成需求方本人。
   */
  resource_claimed_at?: string | null
}

export type CreateRequirementPayload = {
  title: string
  description: string
  budget: number
  acceptance_criteria: string
  payment_mode: RequirementPaymentMode
}

export type CommentRequirementPayload = {
  rating: number
  comment?: string
}

export type RequirementResourceVisibility = 'public' | 'private'

export type UpdateRequirementResourceVisibilityPayload = {
  visibility: RequirementResourceVisibility
}

export type ReviewRequirementResourceDeletePayload = {
  version_id: number
  action: 'approve' | 'reject'
  note?: string
}

export type UpdateRequirementSubscriptionPayload = {
  subscribe_status_change: boolean
}

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

export async function getRequirementOverview(token: string): Promise<RequirementOverviewResp> {
  return requestJson<RequirementOverviewResp>(
    '/requirements/overview',
    {
      headers: {
        ...authHeader(token),
      },
    },
    '加载概览失败',
  )
}

export async function getPublicRequirementOverview(): Promise<RequirementOverviewResp> {
  return requestJson<RequirementOverviewResp>(
    '/public/requirements/public-overview',
    {},
    '加载概览失败',
  )
}

export async function listPublicRequirementSpotlights(
  page = 1,
  pageSize = 20,
): Promise<PublicRequirementSpotlightPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return requestJson<PublicRequirementSpotlightPage>(
    `/public/requirements/public-spotlight?${params.toString()}`,
    {},
    '加载精选需求失败',
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

export async function updateRequirementSubscription(
  token: string,
  requirementId: string,
  payload: UpdateRequirementSubscriptionPayload,
): Promise<void> {
  await requestJson<unknown>(
    `/requirements/${encodeURIComponent(requirementId)}/subscription`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新需求订阅失败',
  )
}
