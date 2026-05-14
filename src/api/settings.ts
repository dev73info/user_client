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
  avatar_url?: string | null
  two_factor_enabled: boolean
  subscribe_official_activity: boolean
  subscribe_dev_hall_deposit_paid?: boolean
}

export type UserSubscriptionsResp = {
  subscribe_official_activity: boolean
}

export type ActivityCampaignClaimResp = {
  activity_id: number
  title: string
  coupon_type: 'amount' | 'percent'
  coupon_name: string
  assigned_coupon_code: string
  claimed_at: string
  already_claimed: boolean
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

export async function uploadProfileAvatar(token: string, file: File): Promise<UserProfileResp> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<UserProfileResp>(
    '/settings/profile/avatar',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传头像失败',
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

export async function sendProfileTwoFactorCode(token: string): Promise<void> {
  await requestVoid(
    '/settings/profile/two-factor-code',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '发送两步验证验证码失败',
  )
}

export async function updateProfileTwoFactor(
  token: string,
  enabled: boolean,
  emailCode: string,
): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
    '/settings/profile/two-factor',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ two_factor_enabled: enabled, email_code: emailCode }),
    },
    '更新两步验证失败',
  )
}

export async function updateProfileSubscriptions(
  token: string,
  payload: UserSubscriptionsResp,
): Promise<UserSubscriptionsResp> {
  return requestJson<UserSubscriptionsResp>(
    '/settings/profile/subscriptions',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新订阅设置失败',
  )
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
