/**
 * 登录 / 注册的请求体组装。
 *
 * 两个端点的字段集**不一样**（契约 `LoginRequest` / `RegisterRequest`），早先两条共用一份
 * 「大而全」的 body，登录时会多塞邮箱、邮箱验证码、邀请码、分享参数这些登录端不认的键。
 * 从 `client.ts` 拆出来（那里已到 300 行的模块上限），只做「入参 → 契约请求体」的映射，不发请求。
 */
import { md5Hex } from './md5'

/** 只会打这两个端点，别处不认。 */
export type AuthPath = '/auth/login' | '/auth/register'

export type AuthBodyInput = {
  username: string
  password: string
  email?: string
  emailCode?: string
  requestDevRole: boolean
  twoFactorCode?: string
  inviteCode?: string
  shareType?: string
  shareTargetId?: string
  turnstileToken?: string
}

/**
 * 按契约各自的 requestBody 组装请求体。
 *
 * 密码一律 `md5(明文)` 的 32 位小写十六进制——后端只接受这个格式，明文一律 400。
 * 登录额外携带 `legacy_password`，仅用于 1.0 迁移账号首次登录时兼容
 * bcrypt(明文密码)；后端升级到 Argon2id 后不会再读取它。
 * 没有值的键直接不出现，不要用空串占位。
 */
export function buildAuthBody(path: AuthPath, input: AuthBodyInput): Record<string, unknown> {
  const base = {
    username: input.username,
    password: md5Hex(input.password),
    ...(input.requestDevRole ? { request_dev_role: true } : {}),
    ...(input.turnstileToken ? { turnstile_token: input.turnstileToken } : {}),
  }

  if (path === '/auth/login') {
    return {
      ...base,
      ...(input.password ? { legacy_password: input.password } : {}),
      ...(input.twoFactorCode ? { two_factor_code: input.twoFactorCode } : {}),
    }
  }

  return {
    ...base,
    ...(input.email ? { email: input.email } : {}),
    ...(input.emailCode ? { email_code: input.emailCode } : {}),
    ...(input.inviteCode ? { invite_code: input.inviteCode } : {}),
    ...(input.shareType ? { share_type: input.shareType } : {}),
    ...(input.shareTargetId ? { share_target_id: input.shareTargetId } : {}),
  }
}
