import { authHeader, requestJson } from '@/api/http'

import type {
  CreateMcResourceVersionRequest,
  McResourceVersionPayload,
  UpdateMcResourceVersionRequest,
} from './types'

export async function createMcResourceVersion(
  token: string,
  resourceId: number,
  payload: CreateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  const formData = new FormData()
  formData.append('version', payload.version)
  if (payload.note?.trim()) {
    formData.append('note', payload.note.trim())
  }
  formData.append('file', payload.file)

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '发布新版本失败',
  )
}

export async function listMcResourceVersions(
  token: string,
  resourceId: number,
): Promise<McResourceVersionPayload[]> {
  return requestJson<McResourceVersionPayload[]>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载版本列表失败',
  )
}

export async function updateMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
  payload: UpdateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  if (payload.file) {
    const formData = new FormData()
    formData.append('version', payload.version)
    if (payload.note?.trim()) {
      formData.append('note', payload.note.trim())
    }
    formData.append('file', payload.file)
    return requestJson<McResourceVersionPayload>(
      `/dev/resources/resources/${resourceId}/versions/${versionId}`,
      {
        method: 'PATCH',
        headers: {
          ...authHeader(token),
        },
        body: formData,
      },
      '更新版本失败',
    )
  }

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新版本失败',
  )
}

export async function deleteMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除版本失败',
  )
}
