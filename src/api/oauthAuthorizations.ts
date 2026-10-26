import { authHeaders, requestJson, requestVoid } from '@/api/http'
import type { components } from '@/api/generated/schema'

type Schemas = components['schemas']

export type OAuthAuthorization = Schemas['UserAuthorizationResponse']

export async function listOAuthAuthorizations(token: string): Promise<OAuthAuthorization[]> {
  return requestJson<OAuthAuthorization[]>(
    '/oauth/authorizations',
    { headers: authHeaders(token) },
    '加载已授权应用失败',
  )
}

export async function revokeOAuthAuthorization(
  token: string,
  developerUsername: string,
): Promise<void> {
  await requestVoid(
    `/oauth/authorizations/${encodeURIComponent(developerUsername)}`,
    { method: 'DELETE', headers: authHeaders(token) },
    '撤销授权失败',
  )
}
