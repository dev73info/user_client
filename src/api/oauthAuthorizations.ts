import { authHeaders, requestJson, requestVoid } from '@/api/http'

/** 买家「已授权应用」：某个开发者站点与本平台账号的授权关系。 */
export type OAuthAuthorization = {
  developer_username: string
  /** 该开发者下与本账号关联的全部外部用户 ID */
  external_user_ids: string[]
  /** 该开发者名下仍是接口类别的资源数量 */
  api_resource_count: number
  authorized_at: string
  updated_at: string
}

/** 当前账号被哪些开发者站点授权关联。 */
export async function listOAuthAuthorizations(token: string): Promise<OAuthAuthorization[]> {
  return requestJson<OAuthAuthorization[]>(
    '/oauth/authorizations',
    { headers: authHeaders(token) },
    '加载已授权应用失败',
  )
}

/** 撤销对某个开发者的授权：后端删除映射并撤销该开发者签发的全部令牌。 */
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
