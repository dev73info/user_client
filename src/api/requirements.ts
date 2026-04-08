import { authHeader, requestJson } from '@/api/http'

export type RecentDeal = {
  payment_id: string
  requirement_id: string
  amount_cny: number
  paid_at: string
}

export type RequirementOverviewResp = {
  total_orders: number
  total_turnover_cny: number
  recent_deals: RecentDeal[]
}

export type RequirementStatus =
  | 'pending_review'
  | 'rejected'
  | 'pending_deposit'
  | 'deposit_paid'
  | 'in_development'
  | 'pending_final'
  | 'completed'

export type RequirementItem = {
  id: number
  requirement_id: string
  title: string
  status: RequirementStatus
  budget?: number | null
  payment_method?: string | null
  updated_at: string
}

export type CreateRequirementPayload = {
  title: string
  description: string
  budget?: number
  acceptance_criteria?: string
}

export async function listRequirements(token: string): Promise<RequirementItem[]> {
  return requestJson<RequirementItem[]>(
    '/requirements/',
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
