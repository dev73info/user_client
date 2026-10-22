import { authHeaders, requestJson } from '@/api/http'

import { COMMUNITY_API_PREFIX } from './prefix'
import type { CommunityCommentLikeState, CommunityFavoriteState, CommunityLikeState } from './types'

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
