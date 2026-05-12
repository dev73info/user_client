import { authHeader, authHeaders, requestJson } from '@/api/http'

export type CommunityTag = {
  id: number
  name: string
}

export type CommunityPost = {
  id: number
  author: string
  author_avatar_url?: string | null
  title: string
  tags: CommunityTag[]
  content_html: string
  like_count: number
  comment_count: number
  liked_by_me: boolean
  published_at: string
  updated_at: string
}

export type CommunityComment = {
  id: number
  post_id: number
  commenter: string
  commenter_avatar_url?: string | null
  comment_text: string
  created_at: string
  updated_at: string
}

export type CommunityLikeState = {
  post_id: number
  liked_by_me: boolean
  like_count: number
}

export type CommunityPostPayload = {
  title: string
  tag_names: string[]
  content_html: string
}

const COMMUNITY_API_PREFIX = '/community'

export async function listCommunityTags(): Promise<CommunityTag[]> {
  return requestJson<CommunityTag[]>(
    `${COMMUNITY_API_PREFIX}/tags`,
    { method: 'GET' },
    '加载社区标签失败',
  )
}

export async function listCommunityPosts(params: {
  token?: string | null
  tag?: string
  limit?: number
  offset?: number
} = {}): Promise<CommunityPost[]> {
  const search = new URLSearchParams()
  if (params.tag?.trim()) search.set('tag', params.tag.trim())
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

export async function listCommunityComments(postId: number): Promise<CommunityComment[]> {
  return requestJson<CommunityComment[]>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/comments`,
    { method: 'GET' },
    '加载评论失败',
  )
}

export async function createCommunityComment(
  token: string,
  postId: number,
  comment: string,
): Promise<CommunityComment> {
  return requestJson<CommunityComment>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/comments`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ comment }),
    },
    '发表评论失败',
  )
}

export async function likeCommunityPost(
  token: string,
  postId: number,
): Promise<CommunityLikeState> {
  return requestJson<CommunityLikeState>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/likes`,
    {
      method: 'POST',
      headers: authHeaders(token),
    },
    '点赞失败',
  )
}

export async function unlikeCommunityPost(
  token: string,
  postId: number,
): Promise<CommunityLikeState> {
  return requestJson<CommunityLikeState>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/likes`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
    '取消点赞失败',
  )
}
