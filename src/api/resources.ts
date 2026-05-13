import {
  HttpError,
  authHeader,
  authHeaders,
  apiUrl,
  readErrorMessage,
  requestJson,
} from '@/api/http'

export type McResourcePlatform = string

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_alias?: string
  group_path: string[]
  group_path_aliases?: string[]
  tag_ids: number[]
  tag_names: string[]
  tag_aliases?: string[]
}

export type PublicMcResourceItem = {
  id: number
  creator: string
  creator_avatar_url?: string | null
  requirement_id: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: 'draft' | 'review' | 'published'
  release_note: string | null
  created_at: string
  updated_at: string
  like_count: number
  creator_credit_score?: number | null
  liked_by_me: boolean
}

export type PublicMcResourceVersionItem = {
  id: number
  resource_id: number
  version: string
  resource: string
  note: string | null
  creator: string
  created_at: string
}

export type PublicMcResourceCommentItem = {
  id: number
  resource_id: number
  commenter: string
  comment_text: string
  created_at: string
  updated_at: string
}

export type CreatePublicMcResourceCommentPayload = {
  comment: string
}

export type PublicMcResourceLikeState = {
  resource_id: number
  liked_by_me: boolean
  like_count: number
}

let allResourcesCache: { data: PublicMcResourceItem[]; ts: number } | null = null
let allResourcesInflight: Promise<PublicMcResourceItem[]> | null = null
const RESOURCE_CACHE_TTL = 60_000
const PUBLIC_RESOURCE_API_PREFIX = '/resource/resources'

async function getAllPublicMcResources(token?: string | null): Promise<PublicMcResourceItem[]> {
  const authToken = token?.trim()
  if (authToken) {
    return requestJson<PublicMcResourceItem[]>(
      PUBLIC_RESOURCE_API_PREFIX,
      {
        method: 'GET',
        headers: authHeader(authToken),
      },
      '加载资源列表失败',
    )
  }

  const now = Date.now()
  if (allResourcesCache && now - allResourcesCache.ts < RESOURCE_CACHE_TTL) {
    return allResourcesCache.data
  }

  if (allResourcesInflight) {
    return allResourcesInflight
  }

  allResourcesInflight = requestJson<PublicMcResourceItem[]>(
    PUBLIC_RESOURCE_API_PREFIX,
    { method: 'GET' },
    '加载资源列表失败',
  )
    .then((data) => {
      allResourcesCache = { data, ts: Date.now() }
      allResourcesInflight = null
      return data
    })
    .catch((err) => {
      allResourcesInflight = null
      throw err
    })

  return allResourcesInflight
}

export async function listPublicMcResources(
  platform: McResourcePlatform,
  token?: string | null,
): Promise<PublicMcResourceItem[]> {
  const all = await getAllPublicMcResources(token)
  return all.filter((item) => item.platform === platform)
}

export async function listAllPublicMcResources(
  token?: string | null,
): Promise<PublicMcResourceItem[]> {
  return getAllPublicMcResources(token)
}

export function invalidateResourceListCache() {
  allResourcesCache = null
  allResourcesInflight = null
}

export async function getPublicMcResource(
  resourceId: number,
  token?: string | null,
): Promise<PublicMcResourceItem> {
  return requestJson<PublicMcResourceItem>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}`,
    {
      method: 'GET',
      headers: token ? authHeader(token) : undefined,
    },
    '加载资源主页失败',
  )
}

export async function listPublicMcResourceVersions(
  resourceId: number,
  token?: string | null,
): Promise<PublicMcResourceVersionItem[]> {
  return requestJson<PublicMcResourceVersionItem[]>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/versions`,
    {
      method: 'GET',
      headers: token ? authHeader(token) : undefined,
    },
    '加载历史版本失败',
  )
}

export async function listPublicMcResourceComments(
  resourceId: number,
  token?: string | null,
): Promise<PublicMcResourceCommentItem[]> {
  return requestJson<PublicMcResourceCommentItem[]>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/comments`,
    {
      method: 'GET',
      headers: token ? authHeader(token) : undefined,
    },
    '加载资源评论失败',
  )
}

export async function createPublicMcResourceComment(
  token: string,
  resourceId: number,
  payload: CreatePublicMcResourceCommentPayload,
): Promise<PublicMcResourceCommentItem> {
  return requestJson<PublicMcResourceCommentItem>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/comments`,
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    },
    '提交资源评论失败',
  )
}

export async function likePublicMcResource(
  token: string,
  resourceId: number,
): Promise<PublicMcResourceLikeState> {
  return requestJson<PublicMcResourceLikeState>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/likes`,
    {
      method: 'POST',
      headers: authHeader(token),
    },
    '点赞资源失败',
  )
}

export async function unlikePublicMcResource(
  token: string,
  resourceId: number,
): Promise<PublicMcResourceLikeState> {
  return requestJson<PublicMcResourceLikeState>(
    `${PUBLIC_RESOURCE_API_PREFIX}/${resourceId}/likes`,
    {
      method: 'DELETE',
      headers: authHeader(token),
    },
    '取消点赞失败',
  )
}

function getResponseFileName(response: Response, fallbackFileName: string): string {
  const disposition = response.headers.get('content-disposition') ?? ''
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const plainMatch = disposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1]
  }

  return fallbackFileName
}

export async function downloadPublicMcResourceFile(
  path: string,
  fallbackFileName: string,
  token?: string | null,
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(apiUrl(path), {
    method: 'GET',
    headers: token ? authHeader(token) : undefined,
  })

  if (!response.ok) {
    throw new HttpError(response.status, await readErrorMessage(response, '下载资源失败'))
  }

  return {
    blob: await response.blob(),
    fileName: getResponseFileName(response, fallbackFileName),
  }
}
