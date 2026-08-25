import { authHeader, authHeaders, requestJson } from '@/api/http'

export type CommunityTag = {
  id: number
  name: string
}

export type CommunityPostStatus = 'pending_review' | 'published' | 'rejected'

export type CommunityPost = {
  id: number
  author: string
  author_avatar_url?: string | null
  author_username_gradient?: boolean
  author_username_color?: string | null
  title: string
  status: CommunityPostStatus
  review_note?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  tags: CommunityTag[]
  content_html: string
  like_count: number
  comment_count: number
  liked_by_me: boolean
  favorited_by_me: boolean
  published_at: string
  updated_at: string
}

export type CommunityComment = {
  id: number
  post_id: number
  parent_comment_id?: number | null
  parent_commenter?: string | null
  commenter: string
  commenter_avatar_url?: string | null
  commenter_username_gradient?: boolean
  commenter_username_color?: string | null
  comment_text: string
  like_count: number
  liked_by_me: boolean
  created_at: string
  updated_at: string
}

export type CommentWarning = {
  id: number
  comment_type: 'community' | 'resource'
  comment_id: number
  comment_snapshot: string
  reason: string
  operator: string
  created_at: string
}

export async function listMyCommentWarnings(token: string): Promise<CommentWarning[]> {
  return requestJson<CommentWarning[]>('/community/comment-warnings', {
    headers: authHeaders(token),
  }, '加载评论警告失败')
}

export type CommunityCommentLikeState = {
  comment_id: number
  liked_by_me: boolean
  like_count: number
}

export type CommunityLikeState = {
  post_id: number
  liked_by_me: boolean
  like_count: number
}

export type CommunityFavoriteState = {
  post_id: number
  favorited_by_me: boolean
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

export async function listCommunityComments(
  postId: number,
  token?: string | null,
): Promise<CommunityComment[]> {
  const normalizedToken = token?.trim()
  return requestJson<CommunityComment[]>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/comments`,
    {
      method: 'GET',
      headers: normalizedToken ? authHeader(normalizedToken) : undefined,
    },
    '加载评论失败',
  )
}

export async function createCommunityComment(
  token: string,
  postId: number,
  comment: string,
  parentCommentId?: number | null,
): Promise<CommunityComment> {
  return requestJson<CommunityComment>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/comments`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ comment, parent_comment_id: parentCommentId ?? null }),
    },
    '发表评论失败',
  )
}

export async function likeCommunityComment(
  token: string,
  commentId: number,
): Promise<CommunityCommentLikeState> {
  return requestJson<CommunityCommentLikeState>(
    `${COMMUNITY_API_PREFIX}/comments/${commentId}/likes`,
    { method: 'POST', headers: authHeaders(token) },
    '点赞评论失败',
  )
}

export async function unlikeCommunityComment(
  token: string,
  commentId: number,
): Promise<CommunityCommentLikeState> {
  return requestJson<CommunityCommentLikeState>(
    `${COMMUNITY_API_PREFIX}/comments/${commentId}/likes`,
    { method: 'DELETE', headers: authHeaders(token) },
    '取消评论点赞失败',
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

export async function favoriteCommunityPost(
  token: string,
  postId: number,
): Promise<CommunityFavoriteState> {
  return requestJson<CommunityFavoriteState>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/favorites`,
    { method: 'POST', headers: authHeaders(token) },
    '收藏帖子失败',
  )
}

export async function unfavoriteCommunityPost(
  token: string,
  postId: number,
): Promise<CommunityFavoriteState> {
  return requestJson<CommunityFavoriteState>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/favorites`,
    { method: 'DELETE', headers: authHeaders(token) },
    '取消收藏失败',
  )
}
