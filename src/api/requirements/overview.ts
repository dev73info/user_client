import { authHeader, requestJson } from '@/api/http'

import type {
  PublicRequirementSpotlightPage,
  RequirementOverviewResp,
  RequirementPaymentMode,
} from './types'

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
  return requestJson<RequirementOverviewResp>('/requirement/public-overview', {}, '加载概览失败')
}

export async function listPublicRequirementSpotlights(
  page = 1,
  pageSize = 20,
  paymentMode?: RequirementPaymentMode,
): Promise<PublicRequirementSpotlightPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  if (paymentMode) {
    params.set('payment_mode', paymentMode)
  }
  return requestJson<PublicRequirementSpotlightPage>(
    `/requirement/public-spotlight?${params.toString()}`,
    {},
    '加载精选需求失败',
  )
}
