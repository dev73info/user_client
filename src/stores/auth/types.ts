/**
 * 登录态 store 的对外类型与鉴权失败的判定口径。
 *
 * 从 `stores/auth.ts` 拆出来：`LoginResult` 是调用方（`composables/authForm/submit.ts`）
 * 依赖的返回值形状，`isAuthRejected` 是「这个错误该不该当成会话失效」的统一判据。
 */
import { HttpError } from '@/api/http'

export type LoginResult = {
  requiresTwoFactor: boolean
  username?: string
  /** 第二步校验用哪种动态码：邮箱验证码或身份验证器动态码。 */
  delivery?: 'email' | 'totp'
}

export function isAuthRejected(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403)
}
