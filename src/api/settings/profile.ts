import { authHeader, requestJson } from '@/api/http'

import type { ProfileResponse, UpdateProfileRequest, UpdateProfileResponse } from './types'

export async function getProfile(token: string): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
    '/settings/profile',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载个人资料失败',
  )
}

/** 改我的档案与登录名；实际改名时响应带新会话令牌。 */
export async function updateProfile(
  token: string,
  payload: Pick<UpdateProfileRequest, 'profile_description' | 'new_username'>,
): Promise<UpdateProfileResponse> {
  return requestJson<UpdateProfileResponse>(
    '/settings/profile',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        profile_description: payload.profile_description ?? null,
        new_username: payload.new_username ?? null,
      }),
    },
    '保存个人资料失败',
  )
}

export async function uploadProfileAvatar(token: string, file: File): Promise<ProfileResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<ProfileResponse>(
    '/settings/profile/avatar',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传头像失败',
  )
}

export async function updateProfileBackgroundStatic(
  token: string,
  imageUrl: string,
  focus?: string,
): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
    '/settings/profile/background-static',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ image_url: imageUrl, focus: focus ?? null }),
    },
    '设置主页背景失败',
  )
}

export async function uploadProfileBackground(token: string, file: File): Promise<ProfileResponse> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<ProfileResponse>(
    '/settings/profile/background-static/upload',
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传背景图片失败',
  )
}

export async function updateProfileBackgroundDynamic(
  token: string,
  imageUrl: string,
  focus?: string,
): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
    '/settings/profile/background-dynamic',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ image_url: imageUrl, focus: focus ?? null }),
    },
    '设置动态背景失败',
  )
}

export async function uploadProfileBackgroundDynamic(
  token: string,
  file: File,
): Promise<ProfileResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<ProfileResponse>(
    '/settings/profile/background-dynamic/upload',
    {
      method: 'POST',
      headers: { ...authHeader(token) },
      body: formData,
    },
    '上传动态背景失败',
  )
}
