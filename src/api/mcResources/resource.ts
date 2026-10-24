import { authHeader, requestJson } from '@/api/http'

import type {
  CreateMcResourceRequest,
  McResourcePayload,
  UpdateMcResourceHomepageRequest,
} from './types'

export async function createMcResource(
  token: string,
  payload: CreateMcResourceRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    '/dev/resources/resources',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '发布资源失败',
  )
}

export async function listMcResources(token: string): Promise<McResourcePayload[]> {
  return requestJson<McResourcePayload[]>(
    '/dev/resources/resources',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源列表失败',
  )
}

export async function listTeamResources(token: string): Promise<McResourcePayload[]> {
  return requestJson<McResourcePayload[]>(
    '/dev/resources/resources/team',
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载团队资源列表失败',
  )
}

export async function getMcResource(token: string, resourceId: number): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载资源详情失败',
  )
}

export async function deleteMcResource(token: string, resourceId: number): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除资源失败',
  )
}

/**
 * 提交公开审核（`POST /api/resources/resources/{resource_id}/submit-review`）。
 *
 * 契约里的动作端点：`draft` / `rejected` → `review`，付费资源没勾版权声明回 400、
 * 已上架或已在审核中回 409。2.0 新增，legacy 没有对应路径——所以不再用 PATCH
 * `visibility: 'review'` 那套（PATCH 只做字段更新，不承担审核动作）。
 */
export async function submitMcResourceReview(
  token: string,
  resourceId: number,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/submit-review`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
    },
    '提交公开审核失败',
  )
}

export async function updateMcResourceHomepage(
  token: string,
  resourceId: number,
  payload: UpdateMcResourceHomepageRequest,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新资源主页失败',
  )
}

export async function uploadMcResourceCover(
  token: string,
  resourceId: number,
  file: File,
): Promise<McResourcePayload> {
  const formData = new FormData()
  formData.append('file', file)

  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/cover`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '上传主页图标失败',
  )
}

/** 对我的资源使用背包中的精选/置顶卡。 */
export async function applyResourcePromoCard(
  token: string,
  resourceId: number,
  cardId: number,
): Promise<McResourcePayload> {
  return requestJson<McResourcePayload>(
    `/dev/resources/resources/${resourceId}/promo-cards/apply`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify({ card_id: cardId }),
    },
    '使用道具卡失败',
  )
}
