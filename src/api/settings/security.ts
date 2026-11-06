import { authHeader, requestJson, requestVoid } from '@/api/http'
import { md5Hex } from '@/shared/auth/md5'

import type { components } from '@/api/generated/schema'
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

/* ------------------------------------------------------------------ 身份验证器（TOTP） */

type TotpStatusResponse = components['schemas']['TotpStatusResponse']
type TotpSetupResponse = components['schemas']['TotpSetupResponse']
type TotpSwitchResponse = components['schemas']['TotpSwitchResponse']

export type ProfileTotpStatus = TotpStatusResponse
export type ProfileTotpSetup = TotpSetupResponse
export type ProfileTotpSwitch = TotpSwitchResponse

/** 只返回是否启用与启用时间，密钥不回显。 */
export async function getProfileTotp(token: string): Promise<TotpStatusResponse> {
  return requestJson<TotpStatusResponse>(
    '/settings/profile/totp',
    {
      headers: authHeader(token),
    },
    '加载身份验证器状态失败',
  )
}

/** 生成待确认密钥与 `otpauth://` 地址；重复调用会覆盖尚未确认的旧密钥。 */
export async function setupProfileTotp(token: string): Promise<TotpSetupResponse> {
  return requestJson<TotpSetupResponse>(
    '/settings/profile/totp/setup',
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '生成绑定密钥失败',
  )
}

export async function enableProfileTotp(
  token: string,
  code: string,
): Promise<TotpSwitchResponse> {
  return requestJson<TotpSwitchResponse>(
    '/settings/profile/totp/enable',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ code }),
    },
    '启用身份验证器失败',
  )
}

export async function disableProfileTotp(
  token: string,
  code: string,
): Promise<TotpSwitchResponse> {
  return requestJson<TotpSwitchResponse>(
    '/settings/profile/totp/disable',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ code }),
    },
    '停用身份验证器失败',
  )
}
