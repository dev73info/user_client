import { authHeader, requestJson } from '@dev/api/http'

export type McResourceVisibility = 'draft' | 'review' | 'published'
export type McResourcePlatform = string

export type CreateMcResourceTagSelection = {
  group_id: number
  tag_ids: number[]
}

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_path: string[]
  tag_ids: number[]
  tag_names: string[]
}

export type CreateMcResourceRequest = {
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: CreateMcResourceTagSelection[]
  file_name: string
  source_url: string
  cover_url?: string | null
  docs_url?: string | null
  visibility: McResourceVisibility
  release_note?: string | null
}

export type McResourcePayload = {
  id: number
  creator: string
  requirement_id: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: McResourceVisibility
  release_note: string | null
  created_at: string
  updated_at: string
}

export type CreateMcResourceVersionRequest = {
  version: string
  file: File
  note?: string | null
}

export type UpdateMcResourceVersionRequest = {
  version: string
  note?: string | null
}

export type McResourceVersionPayload = {
  id: number
  resource_id: number
  version: string
  resource: string
  note: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  creator: string
  created_at: string
}

export type UpdateMcResourceHomepageRequest = {
  title: string
  author: string
  description: string
  cover_url?: string | null
  docs_url?: string | null
  visibility?: McResourceVisibility
  release_note?: string | null
}

export async function createMcResource(
  token: string,
  payload: CreateMcResourceRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    '/dev/resources/resources',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发布资源失败',
  )
}

export async function listMcResources(token: string): Promise<McResourcePayload[]> {
  return requestJson<McResourcePayload[]>(
    '/dev/resources/resources',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源列表失败',
  )
}

export async function getMcResource(token: string, resourceId: number): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源详情失败',
  )
}

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

export async function deleteMcResource(token: string, resourceId: number): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除资源失败',
  )
}

export async function updateMcResourceHomepage(
  token: string,
  resourceId: number,
  payload: UpdateMcResourceHomepageRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新资源主页失败',
  )
}

export async function uploadMcResourceCover(
  token: string,
  resourceId: number,
  file: File,
): Promise<McResourcePayload> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/cover`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传主页图标失败',
  )
}