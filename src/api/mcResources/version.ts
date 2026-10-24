import { authHeader, requestJson } from '@/api/http'

import type {
  CreateMcResourceVersionRequest,
  McResourceVersionPayload,
  UpdateMcResourceVersionRequest,
} from './types'

type UploadedVersionFile = {
  resource: string
  file_name: string
}

async function uploadVersionFile(
  token: string,
  resourceId: number,
  file: File,
): Promise<UploadedVersionFile> {
  const formData = new FormData()
  formData.append('file', file)
  return requestJson<UploadedVersionFile>(
    `/dev/resources/resources/${resourceId}/versions/upload`,
    {
      method: 'POST',
      headers: authHeader(token),
      body: formData,
    },
    '上传版本文件失败',
  )
}

export async function createMcResourceVersion(
  token: string,
  resourceId: number,
  payload: CreateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  const uploaded = await uploadVersionFile(token, resourceId, payload.file)
  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        version: payload.version,
        resource: uploaded.resource,
        file_name: uploaded.file_name,
        note: payload.note?.trim() || null,
        price_fen: payload.price_fen ?? null,
      }),
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
  const uploaded = payload.file ? await uploadVersionFile(token, resourceId, payload.file) : null

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({
        version: payload.version,
        note: payload.note?.trim() || null,
        price_fen: payload.price_fen ?? null,
        ...(uploaded ? { resource: uploaded.resource, file_name: uploaded.file_name } : {}),
      }),
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
