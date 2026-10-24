import { authHeader, requestJson } from '@/api/http'

import type { UpdateProfileResp, UserProfileResp } from './types'

export async function getProfile(token: string): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
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

export async function updateProfile(
  token: string,
  newUsername: string,
  profileDescription?: string,
): Promise<UpdateProfileResp> {
  return requestJson<UpdateProfileResp>(
    '/settings/profile',
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ new_username: newUsername, profile_description: profileDescription }),
    },
    '修改用户名失败',
  )
}

export async function uploadProfileAvatar(token: string, file: File): Promise<UserProfileResp> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<UserProfileResp>(
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
): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
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

export async function uploadProfileBackground(token: string, file: File): Promise<UserProfileResp> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<UserProfileResp>(
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
): Promise<UserProfileResp> {
  return requestJson<UserProfileResp>(
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
): Promise<UserProfileResp> {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<UserProfileResp>(
    '/settings/profile/background-dynamic/upload',
    {
      method: 'POST',
      headers: { ...authHeader(token) },
      body: formData,
    },
    '上传动态背景失败',
  )
}
