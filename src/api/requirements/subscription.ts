import { authHeader, requestJson } from '@/api/http'

import type { UpdateRequirementSubscriptionPayload } from './types'

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
