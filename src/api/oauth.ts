import { HttpError, authHeaders, requestJson } from '@/api/http'

/** 授权页需要的查询参数（GET /api/oauth/authorize 与 POST 共用）。 */
export type OAuthAuthorizeParams = {
  client_id: string
  redirect_uri: string
  response_type?: string
  state?: string
  scope?: string
  code_challenge?: string
  code_challenge_method?: string
}

export type OAuthAuthorizeMeta = {
  client_id: string
  client_name: string
  resource_id: number
  redirect_uri: string
  scope: string
  state: string | null
  user: {
    username: string
    avatar_url: string | null
  }
}

export type OAuthAuthorizeConsent = {
  redirect_url: string
}

/**
 * 后端 OAuth 错误体是 `{"error","error_description"}`；这里把它拆成可读文案，
 * 避免页面直接展示 JSON。
 */
function normalizeOAuthError(error: unknown, fallback: string): Error {
  if (error instanceof HttpError) {
    try {
      const parsed = JSON.parse(error.message) as {
        error?: string
        error_description?: string
      }
      const text = parsed.error_description || parsed.error
      if (text) {
        return new HttpError(error.status, text)
      }
    } catch {
      // 不是 JSON：沿用原始文本
    }
    return new HttpError(error.status, error.message || fallback)
  }
  return error instanceof Error ? error : new Error(fallback)
}

function buildQuery(params: OAuthAuthorizeParams): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? '').trim()
    if (text) {
      query.set(key, text)
    }
  }
  return query.toString()
}

/** 授权页元信息：读取客户端名称、当前账号与关联状态。 */
export async function getOAuthAuthorizeMeta(
  token: string,
  params: OAuthAuthorizeParams,
): Promise<OAuthAuthorizeMeta> {
  try {
    return await requestJson<OAuthAuthorizeMeta>(
      `/oauth/authorize?${buildQuery(params)}`,
      { headers: authHeaders(token) },
      '加载授权信息失败',
    )
  } catch (error) {
    throw normalizeOAuthError(error, '加载授权信息失败')
  }
}

/** 用户同意授权：建立外部用户关联并拿到回跳地址。 */
export async function consentOAuthAuthorize(
  token: string,
  params: OAuthAuthorizeParams,
): Promise<OAuthAuthorizeConsent> {
  try {
    return await requestJson<OAuthAuthorizeConsent>(
      '/oauth/authorize',
      {
        method: 'POST',
        headers: authHeaders(token, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(params),
      },
      '授权失败',
    )
  } catch (error) {
    throw normalizeOAuthError(error, '授权失败')
  }
}
