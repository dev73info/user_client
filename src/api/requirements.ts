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
  title: string
  description?: string | null
  budget?: number | null
  payment_method?: string | null
  payment_mode: RequirementPaymentMode
  status: RequirementStatus
  created_at: string
  updated_at: string
}

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
  resource_visibility?: 'public' | 'private' | null
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
  comment_rating?: number | null
  comment_text?: string | null
  status: RequirementStatus
  budget?: number | null
  payment_method?: string | null
  payment_mode: RequirementPaymentMode
  updated_at: string
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

export async function listPublicRequirementSpotlights(): Promise<PublicRequirementSpotlightItem[]> {
  return requestJson<PublicRequirementSpotlightItem[]>(
    '/public/requirements/public-spotlight',
    {},
    '加载精选需求失败',
  )
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

export async function completeRequirement(
  token: string,
  requirementId: string,
): Promise<RequirementItem> {
  return requestJson<RequirementItem>(
    `/requirements/${encodeURIComponent(requirementId)}/complete`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '确认完成失败',
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
