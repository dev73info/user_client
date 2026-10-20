import { authHeaders, requestJson, requestVoid } from '@/api/http'

/** 接口密钥记录：明文只在创建 / 轮换时返回一次，列表只回前缀。 */
export type ApiKeyRecord = {
  id: number
  name: string
  key_prefix: string
  note: string | null
  is_active: boolean
  created_by: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export type CreatedApiKey = ApiKeyRecord & {
  full_key: string
}

export type CreateApiKeyPayload = {
  name: string
  note?: string | null
  expires_at?: string | null
}

export function listApiKeys(token: string): Promise<ApiKeyRecord[]> {
  return requestJson<ApiKeyRecord[]>(
    '/api_key/api_keys',
    { headers: authHeaders(token) },
    '加载接口密钥失败',
  )
}

export function createApiKey(
  token: string,
  payload: CreateApiKeyPayload,
): Promise<CreatedApiKey> {
  return requestJson<CreatedApiKey>(
    '/api_key/api_keys',
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '创建接口密钥失败',
  )
}

export function revokeApiKey(token: string, id: number): Promise<void> {
  return requestVoid(
    `/api_key/api_keys/${id}/revoke`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '吊销接口密钥失败',
  )
}

/**
 * 取回一把密钥的完整明文（自助页「复制密钥」用）。
 *
 * 后端只把创建者本人的密钥明文返回；存量密钥没有加密列时会回 409，
 * 由 `requestJson` 转成错误提示。
 */
export async function revealApiKey(token: string, id: number): Promise<string> {
  const payload = await requestJson<{ full_key: string }>(
    `/api_key/api_keys/${id}/secret`,
    { headers: authHeaders(token) },
    '取回接口密钥失败',
  )
  return payload.full_key
}
