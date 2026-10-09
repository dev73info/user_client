import { authHeader, requestJson } from '@/api/http'

export type McResourceVisibility = 'draft' | 'review' | 'published'
export type McResourcePlatform = string

export type CreateMcResourceTagSelection = {
  group_id: number
  tag_ids: number[]
}

export type McResourceTagSelectionPayload = {
  group_id: number
  group_name: string
  group_alias?: string
  group_path: string[]
  group_path_aliases?: string[]
  tag_ids: number[]
  tag_names: string[]
  tag_aliases?: string[]
}

export type CreateMcResourceRequest = {
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: CreateMcResourceTagSelection[]
  file_name: string
  source_url: string
  cover_url?: string | null
  docs_url?: string | null
  visibility: McResourceVisibility
  release_note?: string | null
  ownership_type?: 'individual' | 'team' | null
  team_id?: number | null
  origin_type?: 'original' | 'repost' | null
  origin_author?: string | null
  origin_url?: string | null
  origin_org?: string | null
  origin_note?: string | null
  /** 售价（分）；0=免费；与 price_points 互斥 */
  price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选 */
  copyright_declared?: boolean | null
}

export type McResourcePayload = {
  id: number
  creator: string
  ownership_type: 'individual' | 'team'
  team_id?: number | null
  requirement_id: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  platform: McResourcePlatform
  title: string
  author: string
  description: string
  tag_selections: McResourceTagSelectionPayload[]
  file_name: string
  source_url: string
  cover_url: string | null
  docs_url: string | null
  visibility: McResourceVisibility
  release_note: string | null
  origin_type: 'original' | 'repost'
  origin_author: string | null
  origin_url: string | null
  origin_org: string | null
  origin_note: string | null
  /** 售价（分）；0=免费；与 price_points 互斥 */
  price_fen: number
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points: number
  /** 是否已勾选版权声明 */
  copyright_declared: boolean
  copyright_declared_at?: string | null
  /** 曾设过现金售价：设过即不可再改积分售价（改回免费后也一样） */
  cash_price_locked?: boolean
  /** 当前登录买家是否已有有效已购订单（列表通常为 false） */
  purchased_by_me?: boolean
  created_at: string
  updated_at: string
  like_count?: number
  /** 有效精选（后端 query-time） */
  is_featured?: boolean
  featured_at?: string | null
  featured_until?: string | null
  /** 有效置顶（后端 query-time） */
  is_pinned?: boolean
  pinned_until?: string | null
}

export type CreateMcResourceVersionRequest = {
  version: string
  file: File
  note?: string | null
}

export type UpdateMcResourceVersionRequest = {
  version: string
  note?: string | null
  file?: File
}

export type McResourceVersionPayload = {
  id: number
  resource_id: number
  version: string
  resource: string
  note: string | null
  delete_request_status?: 'pending' | 'rejected' | null
  delete_requested_at?: string | null
  delete_reviewed_at?: string | null
  delete_review_note?: string | null
  creator: string
  created_at: string
}

export type UpdateMcResourceHomepageRequest = {
  title: string
  author: string
  description: string
  tag_selections?: CreateMcResourceTagSelection[]
  cover_url?: string | null
  docs_url?: string | null
  visibility?: McResourceVisibility
  release_note?: string | null
  ownership_type?: 'individual' | 'team' | null
  team_id?: number | null
  origin_type?: 'original' | 'repost' | null
  origin_author?: string | null
  origin_url?: string | null
  origin_org?: string | null
  origin_note?: string | null
  /** 售价（分）；0=免费；已发布改价不强制重新审核；与 price_points 互斥 */
  price_fen?: number | null
  /** 积分售价；0=不走积分购；与 price_fen 互斥 */
  price_points?: number | null
  /** 版权声明勾选；付费提交审核时必须为 true */
  copyright_declared?: boolean | null
}

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

export async function createMcResourceVersion(
  token: string,
  resourceId: number,
  payload: CreateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  const formData = new FormData()
  formData.append('version', payload.version)
  if (payload.note?.trim()) {
    formData.append('note', payload.note.trim())
  }
  formData.append('file', payload.file)

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'POST',
      headers: {
        ...authHeader(token),
      },
      body: formData,
    },
    '发布新版本失败',
  )
}

export async function listMcResourceVersions(
  token: string,
  resourceId: number,
): Promise<McResourceVersionPayload[]> {
  return requestJson<McResourceVersionPayload[]>(
    `/dev/resources/resources/${resourceId}/versions`,
    {
      method: 'GET',
      headers: {
        ...authHeader(token),
      },
    },
    '加载版本列表失败',
  )
}

export async function updateMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
  payload: UpdateMcResourceVersionRequest,
): Promise<McResourceVersionPayload> {
  if (payload.file) {
    const formData = new FormData()
    formData.append('version', payload.version)
    if (payload.note?.trim()) {
      formData.append('note', payload.note.trim())
    }
    formData.append('file', payload.file)
    return requestJson<McResourceVersionPayload>(
      `/dev/resources/resources/${resourceId}/versions/${versionId}`,
      {
        method: 'PATCH',
        headers: {
          ...authHeader(token),
        },
        body: formData,
      },
      '更新版本失败',
    )
  }

  return requestJson<McResourceVersionPayload>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader(token),
      },
      body: JSON.stringify(payload),
    },
    '更新版本失败',
  )
}

export async function deleteMcResourceVersion(
  token: string,
  resourceId: number,
  versionId: number,
): Promise<void> {
  await requestJson<unknown>(
    `/dev/resources/resources/${resourceId}/versions/${versionId}`,
    {
      method: 'DELETE',
      headers: {
        ...authHeader(token),
      },
    },
    '删除版本失败',
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