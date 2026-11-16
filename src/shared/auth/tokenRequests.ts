/**
 * 令牌换票请求：登录响应的形状与两个刷新接口。
 *
 * 从 `./client` 拆出（行数预算）：`createAuthApiClient` 只负责组装，
 * 换票逻辑集中在这里，四个前端仓共用同一份口径。
 */

/**
 * 登录 / 注册 / 刷新的响应（契约 `AuthResponse`）。
 *
 * `role` 是主角色、`roles` 是全部角色；**权限判定不要用它们**——生效权限一律以
 * `GET /auth/users/privileges` 的 `permissions` 为准（角色只是展示用的快照）。
 */
export type AuthPayload = {
  token: string
  username?: string
  role?: string
  roles?: string[]
  /** 刷新令牌：只能用于 `/auth/refresh-token` 换新令牌，不能当访问令牌用；旧会话 / 旧响应没有这个字段。 */
  refresh_token?: string
  /** 访问令牌有效期（秒）。 */
  access_token_expires_in?: number
  /** 刷新令牌有效期（秒）。 */
  refresh_token_expires_in?: number
}

type RequestJson = <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
type AuthHeaders = (token: string, headers?: HeadersInit) => Headers

export function createTokenRequests(requestJson: RequestJson, authHeaders: AuthHeaders) {
  /**
   * 旧接口：用访问令牌换一枚新令牌（`POST /auth/refresh`）。
   *
   * 保留它是为了兼容升级前只存了访问令牌的老会话；新会话优先用
   * `refreshSession()`，访问令牌过期后也能静默换票。
   */
  function refreshToken(currentToken: string): Promise<AuthPayload> {
    return requestJson<AuthPayload>(
      '/auth/refresh',
      {
        method: 'POST',
        headers: authHeaders(currentToken),
      },
      '刷新令牌失败',
    )
  }

  /**
   * 用刷新令牌换一对新令牌（`POST /auth/refresh-token`）。
   *
   * **免登录**：不读 `Authorization`、不用 Cookie，只认请求体里的 `refresh_token`。
   * 刷新令牌无效 / 过期 / 用途不对 / 已吊销回 401，账号停用或注销回 403；
   * 刷新令牌带 `typ=refresh`，不能当访问令牌用。
   */
  function refreshSession(refreshToken: string): Promise<AuthPayload> {
    return requestJson<AuthPayload>(
      '/auth/refresh-token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      '刷新令牌失败',
    )
  }

  return { refreshToken, refreshSession }
}
