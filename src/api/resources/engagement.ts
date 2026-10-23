import { authHeader, authHeaders, requestJson } from '@/api/http'

import { PUBLIC_RESOURCE_API_PREFIX } from './types'
import type {
  CreatePublicMcResourceCommentPayload,
  PublicMcResourceCommentItem,
  PublicMcResourceLikeState,
} from './types'

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
