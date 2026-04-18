import { HttpError, authHeader, apiUrl, readErrorMessage, requestJson } from '@/api/http'

export type McResourcePlatform = string

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_path: string[]
  tag_ids: number[]
  tag_names: string[]
}

export type PublicMcResourceItem = {
  id: number
  creator: string
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

let allResourcesCache: { data: PublicMcResourceItem[]; ts: number } | null = null
let allResourcesInflight: Promise<PublicMcResourceItem[]> | null = null
const RESOURCE_CACHE_TTL = 60_000

async function getAllPublicMcResources(): Promise<PublicMcResourceItem[]> {
  const now = Date.now()
  if (allResourcesCache && now - allResourcesCache.ts < RESOURCE_CACHE_TTL) {
    return allResourcesCache.data
  }

  if (allResourcesInflight) {
    return allResourcesInflight
  }

  allResourcesInflight = requestJson<PublicMcResourceItem[]>(
    '/mc-resources/resources',
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
): Promise<PublicMcResourceItem[]> {
  const all = await getAllPublicMcResources()
  return all.filter((item) => item.platform === platform)
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
    `/mc-resources/resources/${resourceId}`,
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
    `/mc-resources/resources/${resourceId}/versions`,
    {
      method: 'GET',
      headers: token ? authHeader(token) : undefined,
    },
    '加载历史版本失败',
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
