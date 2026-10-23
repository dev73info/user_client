import { authHeader, authHeaders, requestJson } from '@/api/http'

import { COMMUNITY_API_PREFIX } from './prefix'
import type { CommentWarning, CommunityComment } from './types'

export async function listMyCommentWarnings(token: string): Promise<CommentWarning[]> {
  return requestJson<CommentWarning[]>(
    `${COMMUNITY_API_PREFIX}/comment-warnings`,
    {
      headers: authHeaders(token),
    },
    '加载评论警告失败',
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
