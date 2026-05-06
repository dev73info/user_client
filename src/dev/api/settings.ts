import { authHeaders, requestJson } from '@dev/api/http'

export type DevProfileSubscriptionsResp = {
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid: boolean
}

export async function getProfileSubscriptions(token: string): Promise<DevProfileSubscriptionsResp> {
  return requestJson<DevProfileSubscriptionsResp>(
    '/settings/profile/subscriptions',
    {
      method: 'GET',
      headers: authHeaders(token),
    },
    '加载订阅设置失败',
  )
}

export async function updateProfileSubscriptions(
  token: string,
  payload: Partial<DevProfileSubscriptionsResp>,
): Promise<DevProfileSubscriptionsResp> {
  return requestJson<DevProfileSubscriptionsResp>(
    '/settings/profile/subscriptions',
    {
      method: 'PUT',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '保存订阅设置失败',
  )
}
