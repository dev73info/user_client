import { authHeader, requestJson } from '@/api/http'

import type { ProfileSubscriptionsResp } from './types'

export async function getProfileSubscriptions(token: string): Promise<ProfileSubscriptionsResp> {
  return requestJson<ProfileSubscriptionsResp>(
    '/settings/profile/subscriptions',
    {
      method: 'GET',
      headers: authHeader(token),
    },
    '加载订阅设置失败',
  )
}

export async function updateProfileSubscriptions(
  token: string,
  payload: Partial<ProfileSubscriptionsResp>,
): Promise<ProfileSubscriptionsResp> {
  return requestJson<ProfileSubscriptionsResp>(
    '/settings/profile/subscriptions',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '保存订阅设置失败',
  )
}
