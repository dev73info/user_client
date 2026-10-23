import { apiUrl, authHeader, requestJson } from '@/api/http'

import type { ActivityCampaignClaimResp, DepositRatioResp } from './types'

export async function getDepositRatio(token: string): Promise<DepositRatioResp | null> {
  const resp = await fetch(apiUrl('/settings/deposit-ratio'), {
    headers: {
      ...authHeader(token),
    },
    credentials: 'omit',
  })

  if (!resp.ok) {
    return null
  }

  return (await resp.json()) as DepositRatioResp
}

export async function claimActivityCampaign(
  token: string,
  claimCode: string,
): Promise<ActivityCampaignClaimResp> {
  return requestJson<ActivityCampaignClaimResp>(
    '/settings/activity-campaigns/claim',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ code: claimCode }),
    },
    '领取活动福利失败',
  )
}
