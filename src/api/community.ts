import type { components, operations } from '@/api/generated/schema'
import { authHeaders, requestJson } from '@/api/http'

type Schemas = components['schemas']

export type CommunityPost = Schemas['CommunityPostPayload']
export type CommunityComment = Schemas['CommunityCommentPayload']
export type CommunityTag = Schemas['CommunityTagPayload']
export type CommunityLike = Schemas['CommunityLikePayload']
export type CommunityCommentLike = Schemas['CommunityCommentLikePayload']
export type CommunityFavorite = Schemas['CommunityFavoritePayload']
export type CreateCommunityPostPayload = Schemas['CreateCommunityPostRequest']
export type UpdateCommunityPostPayload = Schemas['UpdateCommunityPostRequest']
export type CreateCommunityCommentPayload = Schemas['CreateCommunityCommentRequest']
export type CommunityPostListQuery = NonNullable<
  operations['community_post_list']['parameters']['query']
>
export type CommunityBoostKind = 'bump' | 'highlight' | 'homepage' | 'section' | 'hot'

function withQuery(path: string, query: CommunityPostListQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value).trim())
    }
  }
  const suffix = params.toString()
  return suffix ? `${path}?${suffix}` : path
}

function jsonHeaders(token: string): Headers {
  return authHeaders(token, { 'Content-Type': 'application/json' })
}

export function listCommunityTags(): Promise<CommunityTag[]> {
  return requestJson<CommunityTag[]>('/community/tags', {}, '加载社区标签失败')
}

export function listCommunityPosts(
  token: string,
  query: CommunityPostListQuery = {},
): Promise<CommunityPost[]> {
  return requestJson<CommunityPost[]>(
    withQuery('/community/posts', query),
    { headers: authHeaders(token) },
    '加载社区帖子失败',
  )
}

export function listFavoriteCommunityPosts(
  token: string,
  query: CommunityPostListQuery = {},
): Promise<CommunityPost[]> {
  return requestJson<CommunityPost[]>(
    withQuery('/community/posts/favorites', query),
    { headers: authHeaders(token) },
    '加载收藏帖子失败',
  )
}

export function getCommunityPost(token: string, postId: number): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `/community/posts/${postId}`,
    { headers: authHeaders(token) },
    '加载帖子详情失败',
  )
}

export function createCommunityPost(
  token: string,
  payload: CreateCommunityPostPayload,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    '/community/posts',
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '发布帖子失败',
  )
}

export function updateCommunityPost(
  token: string,
  postId: number,
  payload: UpdateCommunityPostPayload,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `/community/posts/${postId}`,
    { method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '保存帖子失败',
  )
}

export function listCommunityComments(token: string, postId: number): Promise<CommunityComment[]> {
  return requestJson<CommunityComment[]>(
    `/community/posts/${postId}/comments`,
    { headers: authHeaders(token) },
    '加载评论失败',
  )
}

export function createCommunityComment(
  token: string,
  postId: number,
  payload: CreateCommunityCommentPayload,
): Promise<CommunityComment> {
  return requestJson<CommunityComment>(
    `/community/posts/${postId}/comments`,
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(payload) },
    '发布评论失败',
  )
}

export function setCommunityPostLike(
  token: string,
  postId: number,
  liked: boolean,
): Promise<CommunityLike> {
  return requestJson<CommunityLike>(
    `/community/posts/${postId}/likes`,
    { method: liked ? 'POST' : 'DELETE', headers: authHeaders(token) },
    '更新帖子点赞失败',
  )
}

export function setCommunityCommentLike(
  token: string,
  commentId: number,
  liked: boolean,
): Promise<CommunityCommentLike> {
  return requestJson<CommunityCommentLike>(
    `/community/comments/${commentId}/likes`,
    { method: liked ? 'POST' : 'DELETE', headers: authHeaders(token) },
    '更新评论点赞失败',
  )
}

export function setCommunityPostFavorite(
  token: string,
  postId: number,
  favorited: boolean,
): Promise<CommunityFavorite> {
  return requestJson<CommunityFavorite>(
    `/community/posts/${postId}/favorites`,
    { method: favorited ? 'POST' : 'DELETE', headers: authHeaders(token) },
    '更新帖子收藏失败',
  )
}

export function acceptCommunityBounty(
  token: string,
  postId: number,
  commentId: number,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `/community/posts/${postId}/bounty/accept/${commentId}`,
    { method: 'POST', headers: authHeaders(token) },
    '采纳悬赏回答失败',
  )
}

export function cancelCommunityBounty(token: string, postId: number): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `/community/posts/${postId}/bounty/cancel`,
    { method: 'POST', headers: authHeaders(token) },
    '取消悬赏失败',
  )
}

export function boostCommunityPost(
  token: string,
  postId: number,
  kind: CommunityBoostKind,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `/community/posts/${postId}/boost`,
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ kind }) },
    '推广帖子失败',
  )
}
