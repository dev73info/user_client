import { authHeader, requestJson } from '@/api/http'

import type { ProfileResponse, UpdateProfileRequest } from './types'

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

/**
 * 改我的档案（`PUT /system/settings/profile`）。
 *
 * **不接受自助改登录名**：契约允许的请求体只有 `profile_description`（`new_username`
 * 传成与当前登录名不同的值会直接 400），改登录名走管理端 `POST /auth/users/username`。
 * 所以这里只收简介，签名上就不给「传个用户名」的机会。
 */
export async function updateProfile(
  token: string,
  payload: Pick<UpdateProfileRequest, 'profile_description'>,
): Promise<ProfileResponse> {
  return requestJson<ProfileResponse>(
    '/settings/profile',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ profile_description: payload.profile_description ?? null }),
    },
    '保存个人简介失败',
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
