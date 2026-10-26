import { authHeader, requestJson, requestVoid } from '@/api/http'

/** 一个 OAuth 客户端（应用）。 */
export type OAuthClient = {
  client_id: string
  name: string
  redirect_uris: string[]
  allowed_scopes: string[]
  is_active: boolean
  /** 密钥掩码前缀，真正的明文只在创建/轮换时回一次。 */
  client_secret_prefix: string
  /** 只有创建/轮换的响应里才有的一次性明文。 */
  client_secret?: string | null
}

export type OAuthClientPayload = {
  name: string
  redirect_uris: string[]
  scopes: string[]
}

/** 支持申请的权限范围。 */
export const OAUTH_SCOPE_OPTIONS = [
  { value: 'profile', label: 'profile（读取账号与实名状态）' },
  { value: 'purchase', label: 'purchase（付费资源购买）' },
] as const

export async function listOAuthClients(token: string): Promise<OAuthClient[]> {
  return requestJson<OAuthClient[]>('/oauth/clients', { headers: authHeader(token) }, '加载接入客户端失败')
}

export async function createOAuthClient(token: string, payload: OAuthClientPayload): Promise<OAuthClient> {
  return requestJson<OAuthClient>(
    '/oauth/clients',
    {
      method: 'POST',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '创建接入客户端失败',
  )
}

export async function updateOAuthClient(
  token: string,
  clientId: string,
  payload: { name: string; redirect_uris: string[] },
): Promise<OAuthClient> {
  return requestJson<OAuthClient>(
    `/oauth/clients/${encodeURIComponent(clientId)}`,
    {
      method: 'PATCH',
      headers: { ...authHeader(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    '保存接入客户端失败',
  )
}

export async function rotateOAuthClientSecret(token: string, clientId: string): Promise<{ client_secret: string }> {
  return requestJson<{ client_secret: string }>(
    `/oauth/clients/${encodeURIComponent(clientId)}/rotate`,
    { method: 'POST', headers: authHeader(token) },
    '轮换密钥失败',
  )
}

export async function deleteOAuthClient(token: string, clientId: string): Promise<void> {
  return requestVoid(
    `/oauth/clients/${encodeURIComponent(clientId)}`,
    { method: 'DELETE', headers: authHeader(token) },
    '删除接入客户端失败',
  )
}

export type OAuthBinding = { username: string; external_user_id: string }

export async function listOAuthClientBindings(token: string, clientId: string): Promise<OAuthBinding[]> {
  return requestJson<OAuthBinding[]>(
    `/oauth/clients/${encodeURIComponent(clientId)}/bindings`,
    { headers: authHeader(token) },
    '加载授权用户失败',
  )
}
