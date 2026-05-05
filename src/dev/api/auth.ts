import { HttpError, authHeaders, requestJson, requestVoid } from '@dev/api/http'
import {
  createAuthApiClient,
  type AgreementAcceptancePayload,
  type AuthPayload,
  type GithubAuthUrlResp,
} from '@/shared/auth/client'

export type { AgreementAcceptancePayload, AuthPayload, GithubAuthUrlResp }

const authClient = createAuthApiClient(
  {
    requestJson,
    requestVoid,
    authHeaders,
    isHttpError: (err): err is HttpError => err instanceof HttpError,
  },
  {
    defaultRequestDevRole: true,
  },
)

export const {
  authRequest,
  refreshToken,
  sendRegisterEmailCode,
  sendResetPasswordEmailCode,
  resetPassword,
  getGithubAuthorizeUrl,
  recordAgreementAcceptance,
} = authClient

export async function requestDevRole(token: string): Promise<{ username: string; role: string }> {
  return requestJson<{ username: string; role: string }>(
    '/auth/request-dev-role',
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '申请开发者权限失败',
  )
}
