import { requestJson } from '@/api/http'

export type PublicUserProfile = {
  username: string
  profile_description: string
  avatar_url: string | null
  home_background_static: string | null
  home_background_dynamic: string | null
  home_background_static_focus: string | null
  home_background_dynamic_focus: string | null
  username_gradient: boolean
  username_color: string | null
}

/**
 * 公开用户档案：无需登录，任何人可读。用于用户主页展示头像、简介、背景与用户名渐变，
 * 不再依赖该用户是否发布过公开资源。
 */
export async function getPublicUserProfile(username: string): Promise<PublicUserProfile> {
  return requestJson<PublicUserProfile>(
    `/user/${encodeURIComponent(username)}`,
    { method: 'GET' },
    '加载用户公开资料失败',
  )
}
