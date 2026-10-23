import { authHeaders, requestJson } from '@/api/http'

import { COMMUNITY_API_PREFIX } from './prefix'
import type { CommunityPost, PostBoostKind } from './types'

export async function acceptBountyAnswer(
  token: string,
  postId: number,
  commentId: number,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/bounty/accept/${commentId}`,
    { method: 'POST', headers: authHeaders(token) },
    '采纳回答失败',
  )
}

export async function cancelPostBounty(token: string, postId: number): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/bounty/cancel`,
    { method: 'POST', headers: authHeaders(token) },
    '取消悬赏失败',
  )
}

/** 用积分购买帖子推广（bump/highlight/homepage/section/hot）。 */
export async function boostCommunityPost(
  token: string,
  postId: number,
  kind: PostBoostKind,
): Promise<CommunityPost> {
  return requestJson<CommunityPost>(
    `${COMMUNITY_API_PREFIX}/posts/${postId}/boost`,
    {
      method: 'POST',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ kind }),
    },
    '购买推广失败',
  )
}
