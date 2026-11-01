/**
 * 消息中心会话行的个人偏好：置顶与删除都只影响本人，不删消息、不影响对方列表。
 *
 * 单独成文件是因为 `shared/conversations.ts` 已经接近模块行数上限；
 * 这组接口与消息收发无关，只挂在会话模块的同一前缀下。
 */

/** 一条会话行的个人偏好。 */
export type ThreadPreference = {
  requirement_id: string
  pinned: boolean
  /** 删除后为 true；对方再发新消息会自动恢复为 false。 */
  hidden: boolean
}

type PreferenceHttpClient = {
  authHeader: (token: string) => Record<string, string>
  requestJson: <T>(path: string, init: RequestInit, fallbackError?: string) => Promise<T>
  requestVoid: (path: string, init: RequestInit, fallbackError?: string) => Promise<void>
}

export function createConversationPreferenceApi(http: PreferenceHttpClient) {
  /** 我设置过的会话行偏好（置顶 / 删除）；删除后又有新消息的行会返回 hidden=false。 */
  async function listThreadPreferences(token: string): Promise<ThreadPreference[]> {
    return http.requestJson<ThreadPreference[]>(
      '/conversation/preferences',
      { headers: { ...http.authHeader(token) } },
      '加载会话偏好失败',
    )
  }

  /** 置顶 / 取消置顶，或从我的列表删除（`hidden: true`）。 */
  async function updateThreadPreference(
    token: string,
    requirementId: string,
    patch: { pinned?: boolean; hidden?: boolean },
  ): Promise<void> {
    await http.requestVoid(
      `/conversation/requirement/${encodeURIComponent(requirementId)}/preference`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...http.authHeader(token),
        },
        body: JSON.stringify(patch),
      },
      '保存会话偏好失败',
    )
  }

  return { listThreadPreferences, updateThreadPreference }
}
