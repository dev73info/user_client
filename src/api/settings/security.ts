import { authHeader, requestJson, requestVoid } from '@/api/http'

import type { UserProfileResp } from './types'

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
