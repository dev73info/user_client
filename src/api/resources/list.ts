import { authHeader, requestJson } from '@/api/http'

import { PUBLIC_RESOURCE_API_PREFIX } from './types'
import type { McResourcePlatform, PublicMcResourceItem, PublicMcResourceVersionItem } from './types'

let allResourcesCache: { data: PublicMcResourceItem[]; ts: number } | null = null
let allResourcesInflight: Promise<PublicMcResourceItem[]> | null = null
const RESOURCE_CACHE_TTL = 60_000

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
