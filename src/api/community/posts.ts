import { authHeader, authHeaders, requestJson } from '@/api/http'

import { COMMUNITY_API_PREFIX } from './prefix'
import type { CommunityPost, CommunityPostPayload, CommunityTag } from './types'

export async function listCommunityTags(): Promise<CommunityTag[]> {
  return requestJson<CommunityTag[]>(
    `${COMMUNITY_API_PREFIX}/tags`,
    { method: 'GET' },
    '加载社区标签失败',
  )
}

export async function listCommunityPosts(
  params: {
    token?: string | null
    tag?: string
    keyword?: string
    limit?: number
    offset?: number
  } = {},
): Promise<CommunityPost[]> {
  const search = new URLSearchParams()
  if (params.tag?.trim()) search.set('tag', params.tag.trim())
  if (params.keyword?.trim()) search.set('keyword', params.keyword.trim())
  if (params.limit) search.set('limit', String(params.limit))
  if (params.offset) search.set('offset', String(params.offset))
  const suffix = search.toString() ? `?${search.toString()}` : ''
  const token = params.token?.trim()

  return requestJson<CommunityPost[]>(
    `${COMMUNITY_API_PREFIX}/posts${suffix}`,
    {
      method: 'GET',
      headers: token ? authHeader(token) : undefined,
    },
    '加载社区帖子失败',
  )
}

export async function listFavoriteCommunityPosts(
  token: string,
  params: { limit?: number; offset?: number } = {},
): Promise<CommunityPost[]> {
  const search = new URLSearchParams()
  if (params.limit) search.set('limit', String(params.limit))
  if (params.offset) search.set('offset', String(params.offset))
  const suffix = search.toString() ? `?${search.toString()}` : ''

  return requestJson<CommunityPost[]>(
    `${COMMUNITY_API_PREFIX}/posts/favorites${suffix}`,
    { method: 'GET', headers: authHeader(token) },
    '加载我的收藏失败',
  )
}

export async function getCommunityPost(
  postId: number,
  token?: string | null,
): Promise<CommunityPost> {
  const normalizedToken = token?.trim()
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}`,
    {
      method: 'GET',
      headers: normalizedToken ? authHeader(normalizedToken) : undefined,
    },
    '加载帖子详情失败',
  )
}

export async function createCommunityPost(
  token: string,
  payload: CommunityPostPayload,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '发布帖子失败',
  )
}

export async function updateCommunityPost(
  token: string,
  postId: number,
  payload: CommunityPostPayload,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}`,
    {
      method: 'PATCH',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    },
    '更新帖子失败',
  )
}
