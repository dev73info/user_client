import { authHeader, requestJson, requestVoid } from '@/api/http'
import { md5Hex } from '@/shared/auth/md5'

import type { ProfileResponse } from './types'

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
): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
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

/**
 * 登录态改密码（`PUT /system/settings/profile/password`）。
 *
 * 契约要求三个字段：`old_password` + `new_password` + `email_code`，两个密码都是
 * **md5(明文) 的 32 位小写十六进制**——明文会被后端直接 400。旧密码是 2.0 比 1.x 多出来的
 * 一道校验（1.x 只看验证码），旧密码错回 400 `INVALID_CURRENT_PASSWORD`；
 * 改密成功后全部旧令牌立即失效，调用方要按「重新登录」处理。
 */
export async function updateProfilePassword(
  token: string,
  oldPassword: string,
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
      body: JSON.stringify({
        old_password: md5Hex(oldPassword),
        new_password: md5Hex(newPassword),
        email_code: emailCode,
      }),
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
): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
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
