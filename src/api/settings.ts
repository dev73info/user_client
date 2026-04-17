import { apiUrl, authHeader, requestJson, requestVoid } from '@/api/http'

export type DepositRatioResp = {
  deposit_ratio_percent: number
  min_percent?: number
  max_percent?: number
}

export type UpdateProfileResp = {
  username: string
  token: string
}

export type UserProfileResp = {
  username: string
  email?: string | null
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

export async function getProfile(token: string): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
    '/settings/profile',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载个人资料失败',
  )
}

export async function sendProfileEmailChangeCode(token: string, newEmail: string): Promise<void> {
  await requestVoid(
    '/settings/profile/email-code',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ new_email: newEmail }),
    },
    '发送邮箱验证码失败',
  )
}

export async function updateProfileEmail(
  token: string,
  newEmail: string,
  emailCode: string,
): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
    '/settings/profile/email',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ new_email: newEmail, email_code: emailCode }),
    },
    '修改邮箱失败',
  )
}

export async function sendProfilePasswordCode(token: string): Promise<void> {
  await requestVoid(
    '/settings/profile/password-code',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '发送密码验证码失败',
  )
}

export async function updateProfilePassword(
  token: string,
  newPassword: string,
  emailCode: string,
): Promise<void> {
  await requestVoid(
    '/settings/profile/password',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ new_password: newPassword, email_code: emailCode }),
    },
    '修改密码失败',
  )
}
