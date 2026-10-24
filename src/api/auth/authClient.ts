import { HttpError, authHeaders, requestJson, requestVoid } from '@/api/http'
import { createAuthApiClient } from '@/shared/auth/client'

/**
 * 登录 / 注册 / 令牌那一组接口由 `@/shared/auth/client` 的工厂生成（四个前端仓共用同一份口径），
 * 这里只负责把本仓的请求层适配进去，再把生成出来的方法原样导出。
 */
const authClient = createAuthApiClient({
  requestJson,
  requestVoid,
  authHeaders,
  isHttpError: (err): err is HttpError => err instanceof HttpError,
})

export const {
  authRequest,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
  resetPassword,
  refreshToken,
  getGithubAuthorizeUrl,
  getGiteeAuthorizeUrl,
  recordAgreementAcceptance,
} = authClient
