import { apiUrl, authHeader, requestJson } from '@/api/http'

export type DepositRatioResp = {
  deposit_ratio_percent: number
  min_percent?: number
  max_percent?: number
}

export type UpdateProfileResp = {
  username: string
  token: string
}

export async function getDepositRatio(token: string): Promise<DepositRatioResp | null> {
  const resp = await fetch(apiUrl('/settings/deposit-ratio'), {
    headers: {
      ...authHeader(token),
    },
  })

  if (!resp.ok) {
    return null
  }

  return (await resp.json()) as DepositRatioResp
}

export async function updateProfile(
  token: string,
  newUsername: string,
): Promise<UpdateProfileResp> {
  return requestJson<UpdateProfileResp>(
    '/settings/profile',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ new_username: newUsername }),
    },
    '修改用户名失败',
  )
}
